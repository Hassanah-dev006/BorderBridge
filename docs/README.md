# Documentation

## `BorderBridge-Proposal-and-SRS.docx`

The project proposal and Software Requirements Specification, written to the ALU template.
66 pages, covering:

| Section | Contents |
|---|---|
| Proposal | Mission, problem statement (WHO/WHAT/WHEN/WHERE/WHY/HOW), gap analysis against existing solutions, development model, hypothesis, references |
| 1 | Purpose, document conventions, intended audience, product scope |
| 2 | Product perspective, functions, user classes, operating environment, constraints, assumptions |
| 3 | User, hardware, software and communications interfaces |
| 4 | Requirement specification — 20 functional requirements |
| 5 | Non-functional requirements — 58, across performance, security, quality attributes and business rules |
| 6 | Appendix A glossary, Appendix B UML models |

The requirement identifiers in Section 4 (`FR-REQ-02`, `FR-CST-01` and so on) are referenced
directly in the source code, so a reader can move from a requirement to its implementation.

## `diagrams/`

Seven figures constituting four UML diagram types. Authored as PlantUML text and rendered at
300 dpi.

| File | Figure | Type |
|---|---|---|
| `B1a_use_case_trader` | B.1a | Use case (behavioural) |
| `B1b_use_case_supply` | B.1b | Use case (behavioural) |
| `B2a_class_core` | B.2a | Class (structural) |
| `B2b_class_fulfilment` | B.2b | Class (structural) |
| `B3_sequence` | B.3 | Sequence (behavioural) |
| `B4a_activity_planning` | B.4a | Activity (behavioural) |
| `B4b_activity_fulfilment` | B.4b | Activity (behavioural) |

To change a diagram, edit the `.puml` and re-render — either at
<https://www.plantuml.com/plantuml>, with the PlantUML extension for VS Code, or on the
command line:

```bash
java -DPLANTUML_LIMIT_SIZE=16384 -jar plantuml.jar -tpng docs/diagrams/*.puml
```

## `tooling/`

Scripts that generate the `.docx` from source, using the [docx](https://www.npmjs.com/package/docx)
library. The document is built rather than hand-edited, so section numbering, tables and
cross-references stay consistent.

```bash
npm install docx
DIAG_DIR=docs/diagrams node docs/tooling/build_full.js output.docx
```

| File | Contents |
|---|---|
| `lib_doc.js` | Shared helpers — headings, tables, figures, references |
| `build_full.js` | Assembles the sections and writes the file |
| `part_proposal.js` | The project proposal |
| `part_srs13.js` | SRS sections 1–3 |
| `part_srs4.js` | SRS section 4, functional requirements |
| `part_srs5.js` | SRS section 5, non-functional requirements |
| `part_appendix.js` | Section 6, glossary and UML appendix |
