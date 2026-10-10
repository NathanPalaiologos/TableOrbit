"""Opt-in private-source benchmark. Report timings/counts, never paths or data values."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import psutil
import pyarrow.dataset as ds
import pyarrow.compute as pc

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from scan_file import discover, scan

class Agent:
    def __init__(self):
        self.child=subprocess.Popen(['node',str(ROOT/'scripts/tableorbit.mjs'),'agent'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',env={**os.environ,'PANEL_SPACE_PYTHON':sys.executable})
        self.process=psutil.Process(self.child.pid)
        self.serial=0
    def request(self,spec):
        self.serial+=1;start=time.perf_counter();peak=0;worker_peak=0
        self.child.stdin.write(json.dumps({'requestId':self.serial,'spec':spec})+'\n');self.child.stdin.flush()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            done=pool.submit(self.child.stdout.readline)
            while not done.done():
                processes=[self.process]+self.process.children(recursive=True)
                total=0
                for p in processes:
                    try:
                        memory=p.memory_info();total+=memory.rss
                        if p.pid!=self.process.pid:worker_peak=max(worker_peak,getattr(memory,'peak_wset',memory.rss))
                    except psutil.NoSuchProcess:pass
                peak=max(peak,total)
                if peak>1_500*1024**2 or time.perf_counter()-start>55:
                    for p in reversed(processes):
                        try:p.kill()
                        except psutil.NoSuchProcess:pass
                    raise RuntimeError('Benchmark exceeded 1,500 MiB process-tree or 55-second budget.')
                time.sleep(.01)
            line=done.result()
        response=json.loads(line)
        if not response['ok']:raise RuntimeError(response['error'])
        return response['result'],{'seconds':round(time.perf_counter()-start,4),'sampled_process_tree_mib':round(peak/1024**2,1),'worker_lifetime_peak_mib':round(worker_peak/1024**2,1),'reply_bytes':len(line.encode())}
    def close(self):
        self.child.stdin.close();self.child.wait(timeout=10)


def main():
    p=argparse.ArgumentParser();p.add_argument('path');p.add_argument('--entity');p.add_argument('--time',required=True);p.add_argument('--measure',required=True);p.add_argument('--year');p.add_argument('--panel',action='store_true');p.add_argument('--render',action='store_true');a=p.parse_args()
    agent=Agent();report={}
    try:
        meta,report['open']=agent.request({'action':'inspect','path':str(Path(a.path).resolve())})
        base={'id':meta['id'],'columns':[a.time,a.measure]}
        first,report['first_page']=agent.request({**base,'action':'page'})
        report.update(bytes=meta['bytes'],records=meta['rows'],files=meta['fileCount'])
        # Alternate three identical page queries with cached metadata on both sides.
        times=[];cold=[]
        snapshot=scan({'action':'inspect','path':a.path})['snapshot']
        for _ in range(3):
            page,m=agent.request({**base,'action':'page'})
            assert page['rows']==first['rows']
            assert page['metrics']['workerPid']==meta['metrics']['workerPid']
            times.append(m['seconds'])
            start=time.perf_counter()
            run=subprocess.run([sys.executable,str(ROOT/'scripts/scan_file.py')],input=json.dumps({'action':'page','snapshot':snapshot,'columns':base['columns']}),text=True,encoding='utf-8',capture_output=True,timeout=30,check=True)
            actual=json.loads(run.stdout)
            assert actual['rows']==first['rows']
            cold.append(round(time.perf_counter()-start,4))
        report['warm_page_seconds']=times
        report['fresh_worker_page_seconds']=cold
        analysis={**base,'columns':[a.measure]}
        if a.year:analysis['timeRange']={'column':a.time,'start':a.year,'end':a.year}
        summary,report['summary']=agent.request({**analysis,'action':'summary'})
        stat=summary['rows'][0]
        figure,report['figure_data']=agent.request({**analysis,'action':'figure-data','time':a.time,'variable':a.measure,'aggregation':'mean','plot':'line'})
        assert sum(p['n'] for p in figure['series'][0]['points'])==int(stat['n'])
        # Independent Arrow streaming count/mean over the same explicit scope.
        dataset=ds.dataset([f['path'] for f in discover(a.path)['files']],format='parquet',partitioning='hive')
        schema=dataset.schema.field(a.time).type
        import pyarrow as pa
        condition=ds.field(a.time)==pa.scalar(int(a.year) if pa.types.is_integer(schema) else a.year,type=schema) if a.year else None
        count=0;total=0.;rows=0
        for batch in dataset.to_batches(columns=[a.measure],filter=condition,batch_size=65536):
            array=batch.column(0);rows+=len(array);count+=len(array)-array.null_count;total+=pc.sum(array).as_py() or 0
        assert count==int(stat['n']) and rows-count==int(stat['missing'])
        assert abs(total/count-float(stat['mean']))<1e-9*max(1,abs(total/count))
        report['arrow_count_mean']='passed';report['summary_records']=rows
        if a.panel:
            panel_base={**analysis,'entity':a.entity,'time':a.time}
            axes,report['key_audit']=agent.request({**panel_base,'action':'axes'})
            cross,report['cross_section']=agent.request({**panel_base,'action':'panel','view':'cross','period':axes['times'][0]})
            series,report['time_series']=agent.request({**panel_base,'action':'panel','view':'series','variable':a.measure})
            assert len(cross['rows'])<=100 and len(series['columns'])<=25
            assert axes['records']==str(rows)
            report['keys_unique']=True
        if a.render:
            artifact,report['figure_render_with_query']=agent.request({**analysis,'action':'figure','time':a.time,'variable':a.measure,'aggregation':'mean','plot':'line','preset':'nature','size':'single'})
            assert set(artifact['rendering']['files'])=={'pdf','png','svg'}
        print(json.dumps(report,indent=2))
    finally:agent.close()

if __name__=='__main__':main()
