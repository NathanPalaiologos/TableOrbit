import * as THREE from './vendor/three.module.min.js';
import { cell, seriesFor } from './data.mjs';

export const entityColors = ['#208c83','#bc8544','#6589ba','#a1749d','#669b62','#bd6b65','#6b9ea9','#a09751','#927757','#8a88ac','#7e9291'];
export const variableColors = ['#298b81','#5c80aa','#b38b50','#8e76a5','#7b9960'];

export class PanelScene {
  constructor(container, onSelect, onPull) {
    this.container = container; this.onSelect = onSelect; this.onPull = onPull;
    this.labels = container.querySelector('#scene-labels'); this.tooltip = container.querySelector('#scene-tooltip');
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0xf7fafb, 0);
    container.prepend(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(34, 1, .1, 300);
    this.target = new THREE.Vector3();
    this.yaw = .68; this.pitch = .37; this.distance = 33;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc4d6da, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, .8); light.position.set(5, 12, 15); this.scene.add(light);
    this.content = new THREE.Group(); this.scene.add(this.content);
    this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2(); this.matrix = new THREE.Matrix4();
    this.rotation = new THREE.Quaternion(); this.scale = new THREE.Vector3();
    this.current = []; this.annotation = []; this.autoRotate = false; this.dirty = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.observer = new ResizeObserver(() => { this.resize(); }); this.observer.observe(container);
    this.setupInput(); this.resize();
    this.visibilityHandler = () => { if (!document.hidden) this.wake(); }; document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pagehide', () => this.dispose(), { once: true });
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.wake();
  }
  cameraPosition() {
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance, Math.sin(this.pitch) * this.distance, Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance).add(this.target);
    this.camera.lookAt(this.target);
  }
  reset() {
    const cube = this.state?.stage === 'cube';
    this.yaw = cube ? .68 : 0; this.pitch = cube ? .37 : .05;
    // Fit flat slices and charts to the viewport rather than leaving a tiny plot in a wide editor.
    this.distance = cube ? 33 : Math.max(11.5, 23 / this.camera.aspect) / (2 * Math.tan(17 * Math.PI / 180));
    this.target.set(0,0,0); this.wake();
  }
  clearContent() {
    this.content.traverse(object => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach(material => material.dispose()); else object.material?.dispose(); });
    this.content.clear(); this.labels.replaceChildren(); this.annotation = [];
  }
  label(text, position, className = '') {
    const element = document.createElement('span'); element.className = `scene-label ${className}`; element.textContent = text;
    this.labels.append(element); this.annotation.push({ element, position: new THREE.Vector3(...position) });
  }
  addLine(points, color, opacity = 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity })); this.content.add(line); return line;
  }
  setData(panel, state) {
    const previousStage = this.state?.stage;
    this.panel = panel; this.state = { ...state, selectedEntities: [...state.selectedEntities] };
    const oldPositions = new Map(this.current.map(item => [item.key, item.position.clone()]));
    this.clearContent(); this.current = [];
    const entities = panel.entities.filter(entity => state.selectedEntities.includes(entity));
    const times = panel.times.filter(time => time >= state.start && time <= state.end);
    const n = entities.length, t = times.length, v = panel.variables.length;
    const entityY = index => ((n - 1) / 2 - index) * Math.min(.74, 9 / Math.max(n, 1));
    const yearX = time => t < 2 ? 0 : (time - times[0]) / (times[t - 1] - times[0]) * 17 - 8.5;
    const timeZ = index => (index - (t - 1) / 2) * state.spacing * Math.min(1, 22 / Math.max(t,1));
    const summary = seriesFor(panel, state.variable, entities, state.start, state.end, state.aggregation);
    const values = summary.flatMap(series => series.points.map(point => point.value)).filter(value => value !== null);
    const low = Math.min(0, ...values), high = Math.max(1, ...values);
    const valueY = value => (value - low) / (high - low) * 8 - 4;
    const showSummary = state.stage !== 'cube' && state.aggregation !== 'none';
    const addItem = (entity, time, variable, value, absent, position, size, color, key) => {
      this.current.push({ entity, time, variable, value, absent, key, target: new THREE.Vector3(...position), position: oldPositions.get(key) ?? new THREE.Vector3(...position), size, color });
    };
    if (showSummary) {
      for (const point of summary[0]?.points ?? []) {
        if (state.stage === 'trend' && point.value === null) continue;
        const position = state.stage === 'trend' ? [yearX(point.time), valueY(point.value), 0] : [yearX(point.time),0,0];
        addItem(null, point.time, state.variable, point.value, false, position, state.stage === 'trend' ? [.15,.15,.15] : [.6,.6,.12], '#23897e', `summary:${point.time}`);
      }
    } else {
      entities.forEach((entity, ei) => times.forEach((time, ti) => panel.variables.forEach((variable, vi) => {
        if (state.stage !== 'cube' && variable !== state.variable) return;
        const { value, absent } = cell(panel, entity, time, variable);
        if (state.stage === 'trend' && value === null) return;
        const range = panel.ranges[variable];
        const normal = value === null ? 0 : (value - range.min) / (range.max - range.min || 1);
        const base = new THREE.Color(variableColors[vi % variableColors.length]);
        const color = new THREE.Color('#eff4f5').lerp(base, .25 + normal * .7);
        if (state.stage === 'cube' && variable !== state.variable) color.lerp(new THREE.Color('#edf1f3'), .42);
        if (value === null) color.set(absent ? '#e4e8eb' : '#c1c9cd');
        if (entity === state.selection.entity && time === state.selection.time && variable === state.variable) color.set('#e3a548');
        let position, size;
        if (state.stage === 'cube') { position = [(vi-(v-1)/2)*2.25,entityY(ei),timeZ(ti)]; size = [1.9,Math.min(.51,6.5/Math.max(n,1)),.10]; }
        else if (state.stage === 'slice') {
          position = state.pivot ? [n < 2 ? 0 : ei / (n-1) * 17-8.5, t < 2 ? 0 : 4.5-ti/(t-1)*9, 0] : [yearX(time), entityY(ei),0];
          size = state.pivot ? [Math.min(1,14/Math.max(n,1)),Math.min(.5,7/Math.max(t,1)),.1] : [Math.min(.7,13/Math.max(t,1)),Math.min(.5,7/Math.max(n,1)),.1];
        } else { position = [yearX(time),valueY(value),0]; size = [.13,.13,.13]; color.set(entityColors[panel.entities.indexOf(entity)%entityColors.length]); }
        addItem(entity,time,variable,value,absent,position,size,color,JSON.stringify([entity,time,variable]));
      })));
    }
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ roughness:.6, metalness:.04 }), this.current.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.current.forEach((item,index) => this.mesh.setColorAt(index, new THREE.Color(item.color)));
    this.mesh.frustumCulled = false; this.content.add(this.mesh);
    if (state.stage === 'cube' && n && t) {
      const left = -v*2.25/2-.15, right = v*2.25/2+.15, top = entityY(0)+.6, bottom = entityY(n-1)-.6;
      times.forEach((time,ti) => {
        const z = timeZ(ti);
        this.addLine([[left,top,z],[right,top,z],[right,bottom,z],[left,bottom,z],[left,top,z]],time===state.selection.time?'#50a098':'#c8dadd',time===state.selection.time ? .8 : .45);
        if (ti%Math.max(1,Math.ceil(t/8))===0 || ti===t-1) this.label(String(time),[right+.5,bottom,z],time===state.selection.time?'focus':'');
      });
      panel.variables.forEach((variable,vi) => this.label(variable,[(vi-(v-1)/2)*2.25,top+.35,timeZ(t-1)],variable===state.variable?'axis focus':'axis'));
      entities.forEach((entity,ei) => { if (n<=15 || ei%Math.ceil(n/12)===0) this.label(entity,[left-1.6,entityY(ei),timeZ(t-1)]); });
      const ti = Math.max(0,times.indexOf(state.selection.time));
      entities.forEach((entity,ei) => { if(n<=12) { const value=cell(panel,entity,times[ti],state.variable).value; this.label(value===null?'—':Number(value.toFixed(1)).toString(),[(panel.variables.indexOf(state.variable)-(v-1)/2)*2.25,entityY(ei),timeZ(ti)+.1],'value'); } });
      this.label('TIME →',[right+1.1,bottom+.8,0],'axis');
    } else if (state.stage === 'slice') {
      if (!state.pivot || showSummary) {
        times.forEach((time,ti) => { if(t<=25||ti%Math.ceil(t/20)===0) this.label(String(time),[yearX(time),n ? entityY(n-1)-.7 : -.7,0]); });
        if(showSummary) this.label(state.aggregation==='sum'?'总和':'均值',[-10,0,0],'axis');
        else entities.forEach((entity,ei) => { if(n<=15||ei%Math.ceil(n/12)===0) this.label(entity,[-10,entityY(ei),0]); });
      } else {
        entities.forEach((entity,ei) => this.label(entity,[n<2?0:ei/(n-1)*17-8.5,5.2,0]));
        times.forEach((time,ti) => { if(t<=25||ti%Math.ceil(t/20)===0) this.label(String(time),[-9.4,t<2?0:4.5-ti/(t-1)*9,0]); });
      }
      if(this.current.length<=90) this.current.forEach(item=>this.label(item.value===null?'—':Number(item.value.toFixed(1)).toString(),[item.target.x,item.target.y,.15],'value'));
    } else if (state.stage === 'trend') {
      for(let i=0;i<=4;i++){const value=low+(high-low)*i/4; this.addLine([[-8.8,valueY(value),-.1],[8.8,valueY(value),-.1]],'#d7e2e6',.8);this.label(Number(value.toFixed(1)).toString(),[-9.8,valueY(value),0]);}
      times.forEach((time,ti)=>{if(t<=10||ti%Math.ceil(t/8)===0||ti===t-1)this.label(String(time),[yearX(time),-4.7,0]);});
      summary.forEach(series=>{
        const color=series.entity?entityColors[panel.entities.indexOf(series.entity)%entityColors.length]:'#23897e';
        let segment=[];
        const flush=()=>{if(segment.length>1)this.addLine(segment,color);segment=[];};
        series.points.forEach(point=>{if(point.value===null)flush();else segment.push([yearX(point.time),valueY(point.value),0]);});flush();
      });
      this.label(state.variable,[-8.6,5,0],'axis'); this.label('时间 →',[8.5,-5.4,0],'axis');
    }
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:'#b27829'}));this.content.add(this.highlight);
    const chosen=this.current.find(item=>item.time===state.selection.time&&item.entity===(showSummary?null:state.selection.entity)&&item.variable===state.variable);
    this.highlight.visible=!!chosen;this.highlightItem=chosen;
    if(previousStage!==state.stage)this.reset();this.animateUntil=performance.now()+(this.reduced?0:650);this.wake();
  }
  pick(event) {
    if(!this.mesh)return null;
    const rect=this.renderer.domElement.getBoundingClientRect();this.mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.mouse,this.camera);
    const intersection=this.raycaster.intersectObject(this.mesh)[0];return intersection?this.current[intersection.instanceId]:null;
  }
  setupInput() {
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);this.drag={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,item:this.pick(event),moved:false};});
    canvas.addEventListener('pointermove',event=>{
      if(this.drag){const dx=event.clientX-this.drag.lastX,dy=event.clientY-this.drag.lastY;this.drag.moved ||= Math.hypot(event.clientX-this.drag.x,event.clientY-this.drag.y)>5;
        if(this.state.stage==='slice'&&this.drag.item&&this.drag.y-event.clientY>55){this.onPull();this.drag=null;return;}
        this.yaw-=dx*.006;this.pitch=Math.max(-1.25,Math.min(1.25,this.pitch+dy*.006));this.drag.lastX=event.clientX;this.drag.lastY=event.clientY;this.tooltip.hidden=true;this.wake();return;}
      const item=this.pick(event);this.tooltip.hidden=!item;if(item){this.tooltip.textContent=`${item.entity??'所选个体汇总'} · ${item.time} · ${item.variable}: ${item.value===null?(item.absent?'无记录':'缺失'):item.value}`;const rect=this.container.getBoundingClientRect();this.tooltip.style.left=`${Math.max(5,Math.min(event.clientX-rect.left+12,rect.width-245))}px`;this.tooltip.style.top=`${Math.max(5,event.clientY-rect.top-55)}px`;}
    });
    canvas.addEventListener('pointerup',event=>{if(this.drag&&!this.drag.moved){const item=this.pick(event);if(item)this.onSelect(item);}this.drag=null;});
    canvas.addEventListener('pointercancel',()=>{this.drag=null;});
    canvas.addEventListener('pointerleave',()=>{this.tooltip.hidden=true;});
    canvas.addEventListener('wheel',event=>{event.preventDefault();this.distance=Math.max(10,Math.min(90,this.distance*Math.exp(event.deltaY*.001)));this.wake();},{passive:false});
    this.container.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(event.key)){event.preventDefault();if(event.key==='ArrowLeft')this.yaw-=.15;if(event.key==='ArrowRight')this.yaw+=.15;if(event.key==='ArrowUp')this.pitch=Math.min(1.25,this.pitch+.1);if(event.key==='ArrowDown')this.pitch=Math.max(-1.25,this.pitch-.1);if(event.key==='+')this.distance=Math.max(10,this.distance-2);if(event.key==='-')this.distance=Math.min(90,this.distance+2);if(event.key==='0')this.reset();this.wake();}});
  }
  wake(){if(!this.frame&&!this.disposed)this.frame=requestAnimationFrame(time=>this.render(time));}
  render(time){this.frame=null;if(this.disposed||document.hidden)return;
    if(this.autoRotate&&!this.reduced)this.yaw+=.002;
    this.cameraPosition();
    this.current.forEach((item,index)=>{if(time<this.animateUntil)item.position.lerp(item.target,.2);else item.position.copy(item.target);this.scale.set(...item.size);this.matrix.compose(item.position,this.rotation,this.scale);this.mesh.setMatrixAt(index,this.matrix);});
    if(this.mesh){this.mesh.instanceMatrix.needsUpdate=true;this.mesh.computeBoundingSphere();}
    if(this.highlightItem){this.highlight.position.copy(this.highlightItem.position);this.highlight.scale.set(...this.highlightItem.size).multiplyScalar(1.13);}
    // Render first so projected labels use the same up-to-date camera matrices.
    this.renderer.render(this.scene,this.camera);
    const width=this.container.clientWidth,height=this.container.clientHeight;
    this.annotation.forEach(({element,position})=>{const projected=position.clone().project(this.camera);element.style.left=`${(projected.x+1)/2*width}px`;element.style.top=`${(-projected.y+1)/2*height}px`;element.hidden=projected.z>1||projected.z< -1;});
    if(time<this.animateUntil||(this.autoRotate&&!this.reduced))this.wake();
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibilityHandler);this.clearContent();this.renderer.dispose();}
}
