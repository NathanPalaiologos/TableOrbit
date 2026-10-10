# Documentation and UI text

Use short sentences, active verbs and consistent terms. These choices follow principles described in the [ASD-STE100 FAQ](https://www.asd-ste100.org/STE_faq.html) and [Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).

This project does not claim full ASD-STE100 compliance. The standard also controls vocabulary. TableOrbit keeps software terms and exact UI labels where readers need them.

## Write instructions

- Start each step with an action: open, select, enter or run.
- Put one action in each step.
- State requirements before the procedure.
- Put a condition before the action it changes.
- State the expected result after the procedure.
- Use the exact command, setting or button label.
- Give errors a next action when one is known.

Keep procedure sentences short. Aim for 20 words or fewer when the instruction remains precise. Do not shorten commands or omit information needed to run them.

## Keep terms consistent

| Term | Meaning |
|---|---|
| Entity | The unit observed over time, such as a firm |
| Time column | The source column used for time keys |
| Variable / measure | A numeric field selected for reading or analysis |
| Import | Load supported text records into the main reader |
| Query | Read selected results through the Parquet engine |
| Extract | Copy filtered Parquet records into the main reader |
| Missing value | A record exists, but the value is missing |
| Absent record | No record exists for an entity–time pair |

English and Chinese must describe the same action and limits. Keep their control structure the same. Use spacing or labels to separate status fields. Avoid decorative dot separators and promotional claims.

## Keep claims testable

Distinguish implemented features from plans. Link performance claims to a dated test record. Give the environment and measurement scope. Preserve dataset sources, units, key rules and statistical definitions when editing.

For screenshots, use public examples or synthetic data. Capture the running application. Do not include private paths, credentials or unrelated windows. Record the capture date and version in [images/README.md](images/README.md).
