// SRS Sections 1-3, in the ALU template structure.
const L = require('./lib_doc');
const { d, P, PR, H1, H2, H3, H4, BULLET, NUM, REF, mkTable, CAP, NOTE, QUOTE } = L;
const { Paragraph, PageBreak } = d;

module.exports = function srs13(c) {

  // =========== 1. INTRODUCTION ===========
  c.push(H1('1. Introduction'));

  c.push(H2('1.1 Purpose'));
  c.push(P('This Software Requirements Specification (SRS) defines the functional and non-functional requirements for BorderBridge version 1.0 — a mobile-first platform that enables small-scale and informal cross-border traders in the East African Community to determine, before travelling, the documentation, costs, border conditions, transport options and market opportunities associated with a specific cross-border consignment.'));
  c.push(P('The document serves four purposes:'));
  c.push(BULLET('To establish a single, agreed and unambiguous statement of what BorderBridge must do, against which design, implementation and testing will be verified.'));
  c.push(BULLET('To give the development team a specification precise enough to build from, and testers requirements specific enough to derive test cases from.'));
  c.push(BULLET('To give stakeholders — traders, transport providers, customs contacts and the academic supervisor — a common reference for judging whether the delivered system meets the need identified in the project proposal.'));
  c.push(BULLET('To serve as the controlled baseline for change management. Any proposed change of scope is assessed against this document.'));
  c.push(PR([['Scope of this release. ', { b: true }], ['This SRS covers the whole of BorderBridge version 1.0. Section 4 specifies 20 functional requirements, Section 5 specifies 58 non-functional requirements, and Section 6 Appendix B contains the UML models. Where a requirement is scheduled for a later release rather than version 1.0, this is stated explicitly against that requirement.']]));

  c.push(H2('1.2 Document Conventions'));
  c.push(P('The following conventions apply throughout.'));
  c.push(mkTable([2400, 6960], [
    ['Convention', 'Meaning'],
    ['“Shall”', 'Denotes a binding requirement. Every numbered requirement in Sections 4 and 5 uses “shall”.'],
    ['“Should”', 'Denotes a desirable but non-binding property. It never appears inside a numbered requirement statement.'],
    ['FR-XXX-nn', 'Functional requirement identifier. XXX is the three-letter module code (for example ACC for Account and Identity, REQ for Trade Requirements); nn is a sequence number within that module.'],
    ['NFR-XXX-nn', 'Non-functional requirement identifier, using the same pattern with quality-attribute codes (for example PER for Performance, SEC for Security). Note that the code ACC denotes Account and Identity in a functional identifier (FR-ACC-nn) but Accuracy in a non-functional one (NFR-ACC-nn); the FR or NFR prefix disambiguates them and the two sets are unrelated.'],
    ['Priority: Must / Should / Could', 'MoSCoW prioritisation. Must denotes a requirement without which version 1.0 cannot ship; Should denotes high value but deferrable; Could denotes desirable if capacity allows. Priorities are assigned per requirement and are not inherited from the parent module.'],
    ['R1 – R4', 'Release identifiers from the incremental roadmap defined in the project proposal: R1 Core, R2 Corridor, R3 Market, R4 Hardening and reporting.'],
    ['Identifier stability', 'Requirement identifiers are permanent. A withdrawn requirement is marked withdrawn rather than deleted, and its identifier is never reused, so that references from the UML models, design and test artefacts remain valid.'],
    ['Typography', 'Requirement identifiers appear in the form FR-ACC-01. Class names, attributes and operations appear in the form TradeIntention and generateChecklist(). Monetary thresholds are stated in the currency of the governing instrument, with USD used where the instrument does.'],
  ], { size: 19 }));
  c.push(CAP('Table 1.1. Document conventions.'));
  c.push(P('The document follows the structure of the IEEE 830 recommended practice for software requirements specifications, adapted to the course template. Requirement statements are written to be individually verifiable: each states a single testable obligation, and each non-functional requirement carries an explicit verification method.'));

  c.push(H2('1.3 Intended Audience and Reading Suggestions'));
  c.push(P('This document has five audiences with different reasons to read it, and they need not read it in the same order.'));
  c.push(mkTable([2000, 3700, 3660], [
    ['Audience', 'Why they read it', 'Suggested reading path'],
    ['Developers', 'To build the system correctly and to know what “done” means', 'Section 2 for context, then Sections 4 and 5 in full, then Appendix B in Section 6 for the models, then Section 3 for interface obligations'],
    ['Testers and QA', 'To derive test cases and acceptance criteria', 'Section 5 first — every non-functional requirement names its verification method — then Section 4 for functional cases, then Appendix B.3 and B.4 in Section 6 for the flows to exercise'],
    ['Project supervisor and assessors', 'To judge completeness, rigour and traceability', 'The project proposal, then Sections 1 and 2, then the traceability tables at Section 5.5 and Appendix B.5'],
    ['Domain stakeholders (traders, cooperatives, transport operators, customs contacts)', 'To validate that the specified system matches how cross-border trade actually works', 'Section 2.2 Product Functions and Section 2.3 User Classes, then Appendix B.1 and B.4 in Section 6, which are the least technical views of the system'],
    ['Future maintainers', 'To extend the system to new corridors or languages', 'Section 2.5 Design and Implementation Constraints, Section 2.7 Assumptions and Dependencies, then NFR-SCA-01 and NFR-SCA-04 in Section 5.1.2 on corridor and language extension'],
  ], { size: 19 }));
  c.push(CAP('Table 1.2. Intended audiences and suggested reading paths.'));
  c.push(P('Readers new to the problem should begin with the project proposal that precedes this specification, which establishes the mission, the problem statement and the gap in existing solutions that BorderBridge addresses. Readers who need only to understand what the system does, without the reasoning behind it, may read Section 2.2 and Appendix B.1 alone.'));

  c.push(H2('1.4 Product Scope'));

  c.push(H3('1.4.1 Product name and identification'));
  c.push(P('The product is named BorderBridge. Version 1.0 targets the East African Community, with the Rwanda–Uganda corridor — principally Gatuna/Katuna and Kagitumba/Mirama Hills — as the pilot deployment.'));

  c.push(H3('1.4.2 What the system will do'));
  c.push(P('BorderBridge accepts a trade intention expressed as an origin country, a destination country, a product and a quantity, and returns an integrated, corridor-specific trade plan. Specifically, the system will:'));
  c.push(BULLET('Generate a personalised checklist of the identity, commercial and customs documents required for the stated consignment, including product-specific requirements such as phytosanitary certificates.'));
  c.push(BULLET('Determine automatically whether the consignment qualifies for the EAC Simplified Trade Regime and, where it does, substitute the reduced requirement set and state the basis of eligibility.'));
  c.push(BULLET('Estimate the total landed cost, decomposed into product value, transport, duties, taxes and administrative fees, with conversion between origin and destination currencies.'));
  c.push(BULLET('Recommend a border crossing and present its official status, published hours and community-reported delay information.'));
  c.push(BULLET('Match the trader with registered transport providers whose route and capacity fit the consignment.'));
  c.push(BULLET('Surface potential buyers and suppliers in the destination market from a verified directory.'));
  c.push(BULLET('Track a declared shipment through defined milestones and notify the trader of relevant events.'));
  c.push(BULLET('Alert traders to changes in regulations, duties or border conditions affecting routes and products they follow.'));
  c.push(BULLET('Present all trader-facing content in English, French, Kiswahili and Kinyarwanda.'));
  c.push(BULLET('Allow authorised administrators to maintain the regulatory knowledge base under version control, with source attribution and verification dates.'));

  c.push(H3('1.4.3 What the system will not do'));
  c.push(mkTable([4200, 5160], [
    ['Exclusion', 'Rationale'],
    ['Submitting customs declarations to national systems on the trader’s behalf', 'Requires formal accreditation and integration agreements with each revenue authority. BorderBridge prepares traders; it does not act as a clearing agent'],
    ['Processing payments, escrow or settlement between parties', 'Financial licensing is out of scope for version 1.0. The platform introduces parties; it does not intermediate money'],
    ['Issuing binding rulings on classification, valuation or duty liability', 'Only competent revenue authorities may do this. BorderBridge provides sourced guidance and states this limitation on every estimate'],
    ['Providing physical logistics, warehousing or insurance', 'The platform is an information and matching layer, not an operator'],
    ['Coverage beyond the EAC in version 1.0', 'The data model supports continental extension, but only EAC corridors are populated and validated initially'],
    ['Guaranteeing the conduct of third parties in the directory', 'The platform verifies registration data and publishes ratings; it does not warrant performance'],
  ], { size: 19 }));
  c.push(CAP('Table 1.3. Explicit scope exclusions for version 1.0.'));

  c.push(H3('1.4.4 Benefits, objectives and goals'));
  c.push(mkTable([700, 4200, 4460], [
    ['#', 'Objective', 'Success indicator'],
    ['O1', 'Reduce the incidence of traders arriving at a border with an incomplete document set', '≥ 30% reduction in missing-document incidents against baseline'],
    ['O2', 'Make the landed cost of a movement predictable before departure', 'Median absolute error of cost estimates ≤ 15%'],
    ['O3', 'Increase awareness and use of the EAC Simplified Trade Regime among eligible traders', '≥ 40 percentage-point increase in correct STR awareness responses'],
    ['O4', 'Reduce time lost to avoidable border delay through better crossing choice', 'Measurable reduction in self-reported waiting time on the pilot corridor'],
    ['O5', 'Be usable by low-literacy and non-English-speaking traders without assistance', '≥ 80% unassisted task completion in usability testing'],
  ], { size: 19 }));
  c.push(CAP('Table 1.4. Product objectives and measurable success indicators.'));
  c.push(P('These objectives align with recommendations arising from the ECA/Afreximbank/AUC/ECOWAS work on informal cross-border trade, which include establishing trader information services and operationalising simplified trade regimes (ECA, 2023).'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // =========== 2. OVERALL DESCRIPTION ===========
  c.push(H1('2. Overall Description'));

  c.push(H2('2.1 Product Perspective'));
  c.push(P('BorderBridge is a new, self-contained product rather than a component of a larger system, and it is not a replacement for any existing system. It occupies a position that is currently empty: between the institutions that publish trade rules and the small traders those rules govern.'));
  c.push(P('As established in the project proposal, authoritative content already exists. National trade information portals in Rwanda and Uganda publish trade procedures step by step, and services such as Sauti East Africa deliver verified procedures and market prices to feature phones. What no existing system does is take the parameters of one shipment and compute an answer specific to it. BorderBridge is therefore best understood as a computational layer over existing authoritative sources rather than as a competing publisher of trade information.'));
  c.push(P('Architecturally, the system is a client–server web application in four layers. A responsive, offline-capable Progressive Web Application serves as the trader-facing client. A server-side application layer hosts the domain logic — the requirements engine, cost engine, border service, matching engine and notification service — over a relational data store. External integrations are isolated behind adapters so that a data source can be replaced, or fall back to curated data, without altering domain logic.'));
  c.push(mkTable([2000, 3200, 4160], [
    ['Layer', 'Components', 'Responsibility'],
    ['Presentation', 'Progressive Web App client; USSD/SMS gateway; localisation service', 'Task-oriented interface, offline caching, multilingual rendering, accessibility'],
    ['Application', 'Requirements engine; cost engine; border service; matching engine; shipment service; notification service', 'All business logic: rule evaluation, cost computation, ranking, matching, state transitions, event dispatch'],
    ['Administration', 'Regulation content management; moderation; reporting and analytics', 'Curation, versioning and audit of regulatory content; integrity of user-generated content'],
    ['Data and integration', 'Relational data store; adapters for tariff schedules, exchange rates and border data', 'Persistence, integrity, and isolation of volatile external dependencies'],
  ], { size: 19 }));
  c.push(CAP('Table 2.1. Architectural layers and their responsibilities.'));

  c.push(H2('2.2 Product Functions'));
  c.push(P('The system provides eleven functional groups. This is a summary; the requirements specified for this release are set out in Section 4, with the identifiers shown against each group below.'));
  c.push(mkTable([2100, 4900, 1180, 1180], [
    ['Function group', 'What it does for the user', 'Requirements', 'Release'],
    ['Account and identity', 'Lets a trader, transport provider or buyer register against a phone number, verify ownership by SMS code, sign in, recover access, and maintain a reusable profile', 'FR-ACC-01, 02', 'R1'],
    ['Trade requirements', 'Takes a stated consignment and returns a document checklist with issuing authority, source citation and verification date for every item, and determines simplified-regime eligibility automatically', 'FR-REQ-01, 02, 03, 05', 'R1'],
    ['Cost estimation', 'Computes an itemised landed cost — product value, transport, duties, taxes, fees — converts currency, and explains the rule behind each line', 'FR-CST-01…04', 'R1'],
    ['Border information', 'Recommends a crossing, presents its official status and hours, and collects community reports of current conditions with age-based expiry', 'FR-BRD-01, 03, 05', 'R2'],
    ['Transport matching', 'Lets providers publish capacity and traders search, request and engage transport, with mutual rating afterwards', 'FR-TRN-02', 'R3'],
    ['Marketplace discovery', 'Surfaces verified buyers and suppliers in the destination market and mediates first contact without exposing personal details', 'FR-MKT-02', 'R3'],
    ['Shipment tracking', 'Converts a plan into a trackable shipment with an immutable planning snapshot and a validated status lifecycle', 'FR-SHP-01', 'R2'],
    ['Notifications and alerts', 'Lets users subscribe to corridors, crossings and product categories, and delivers regulatory, border and shipment alerts', 'FR-NOT-02', 'R2'],
    ['Regulation management', 'Lets administrators create, version, attribute and publish regulatory rules, and flags rules overdue for re-verification', 'FR-ADM-01, 03', 'R1'],
    ['Localisation', 'Presents interface, notifications and exports in the user’s chosen language, marking untranslated content explicitly', 'FR-LOC-01', 'R3'],
    ['Reporting and analytics', 'Gives administrators operational metrics, estimate-accuracy analysis, and anonymised aggregate export for research', 'Deferred to R4', 'R4'],
  ], { size: 19 }));
  c.push(CAP('Table 2.2. Product functions summary.'));
  c.push(NOTE('The central function is the second one. Everything else either feeds it, extends it, or acts on its output. If the checklist and eligibility determination are wrong, no other function has value — which is why regulatory accuracy is treated as the dominant project risk and is given its own quality category in Section 5.4.'));

  c.push(H2('2.3 User Classes and Characteristics'));
  c.push(P('Six user classes interact with the system. They differ substantially in frequency of use, technical confidence, device quality and privilege, and those differences drive concrete requirements rather than being descriptive colour.'));
  c.push(mkTable([1500, 2400, 2000, 1800, 1660], [
    ['User class', 'Characteristics', 'Frequency and context of use', 'Technical expertise', 'Privilege level'],
    ['Trader\n(primary)', 'Small-scale or informal trader, consignments typically under USD 2,000, frequently a woman, often trading agricultural or light consumer goods. Variable literacy; may read Kinyarwanda or Kiswahili rather than English. Entry-level Android handset on a metered, intermittent connection', 'Several times a month, in bursts around a trip. Often used while travelling or at a market, rarely at a desk', 'Low. Comfortable with WhatsApp and mobile money; not with forms, jargon or multi-step web flows', 'Standard user. Owns own data; no administrative rights'],
    ['Transport provider', 'Independent operator of a truck, van or motorcycle with unused capacity on cross-border routes. Runs a small business', 'Daily to weekly, checking for matching loads and responding to requests', 'Low to medium. Familiar with logistics coordination by phone', 'Verified user. May publish listings only after verification'],
    ['Buyer / supplier', 'Wholesaler, retailer or market trader in the destination market seeking counterparties across the border', 'Weekly or occasional, when seeking supply or offering stock', 'Low to medium', 'Verified user'],
    ['Customs officer', 'Border post official. Uses the system in a read-oriented and authoritative capacity rather than as a trader', 'Occasional. Publishes status when conditions change; may view a trader’s prepared summary at the counter', 'Medium. Accustomed to formal customs systems', 'Elevated. May publish official border status that overrides community reports'],
    ['Administrator', 'BorderBridge content and compliance staff maintaining the regulatory knowledge base and moderating content', 'Daily', 'High. Trained on the domain and the administrative interface, but not necessarily a developer', 'Full administrative rights, subject to audit logging'],
    ['Scheduler\n(automated)', 'Internal automated actor with no human operator', 'Continuous', 'Not applicable', 'System-level, non-interactive'],
  ], { size: 19 }));
  c.push(CAP('Table 2.3. User classes and their characteristics.'));
  c.push(P('The trader class is the one the product is designed for. Where a design decision would favour another class at the trader’s expense — for instance, richer administrative reporting at the cost of a heavier client payload — the trader takes precedence. Two characteristics of that class shape the whole specification: variable literacy in a language that may not be English, and a constrained device on a constrained connection. These give rise directly to the localisation requirements (FR-LOC-01…03), the accessibility and readability requirements (NFR-USA-03, NFR-USA-04), the payload budget (NFR-PER-04) and the offline and fallback requirements (NFR-REL-02, NFR-USA-07).'));

  c.push(H2('2.4 Operating Environment'));
  c.push(mkTable([2400, 6960], [
    ['Element', 'Specification'],
    ['Client devices', 'Android smartphones from Android 8.0; iOS from version 14; desktop browsers (Chrome, Firefox, Safari, Edge — current and one prior major version). Entry-level Android on a small screen is the design reference, not a desktop browser'],
    ['Client application', 'Responsive Progressive Web App with service-worker offline caching and installable home-screen behaviour. No app-store distribution is required'],
    ['Fallback channel', 'USSD and SMS path for the checklist and cost-estimate functions, for users on feature phones or without a data connection'],
    ['Server environment', 'Containerised application services on a cloud platform with an African or European region of presence, orchestrated so that services may be scaled horizontally'],
    ['Data store', 'PostgreSQL relational database with full audit history on regulatory content'],
    ['Network assumption', 'Intermittent 2G/3G connectivity with high latency and metered data is the design baseline. Continuous broadband is treated as a fortunate exception, not an assumption'],
    ['Coexisting software', 'The system must coexist with, and where possible consume data from, national trade information portals and revenue authority publications. It does not require any software to be installed alongside it on the client device'],
  ], { size: 19 }));
  c.push(CAP('Table 2.4. Operating environment.'));

  c.push(H2('2.5 Design and Implementation Constraints'));
  c.push(P('The following constraints bound the design. They are obligations on the developer, not preferences.'));
  c.push(mkTable([700, 2500, 6160], [
    ['#', 'Constraint', 'Explanation and consequence'],
    ['C1', 'Regulatory content must be data, not code', 'Rules change during and after development. Duty rates, document requirements, thresholds and product lists shall be stored as versioned data editable by a trained non-developer administrator. No rule may be hard-coded'],
    ['C2', 'Every rule must carry a source and a verification date', 'The system advises people who face real consequences at a border. No regulatory statement may be displayed without its governing instrument and the date it was last verified. This constrains the data model, not merely the interface'],
    ['C3', 'The system must not represent itself as a customs authority', 'BorderBridge may not issue binding determinations on classification, valuation or duty liability. Every cost estimate must carry a non-dismissible statement that it is guidance'],
    ['C4', 'Offline-first, not offline-tolerant', 'Cached content must remain readable with no connectivity, and actions taken offline must queue and synchronise without loss or duplication. This forecloses architectures that assume a live connection for read operations'],
    ['C5', 'Strict client payload budget', 'The initial payload shall not exceed 500 KB compressed. This rules out heavy client frameworks and large font or icon libraries, and constrains the choice of UI toolkit'],
    ['C6', 'Data protection compliance', 'The system processes personal data including national identification numbers, and must comply with Rwanda Law No. 058/2021 on the protection of personal data and privacy and equivalent obligations in each jurisdiction of operation'],
    ['C7', 'No enforcement-usable record of informal activity', 'The system must not be capable of reporting individually attributable information about undeclared trade to any authority. Traders must not be exposed to enforcement risk by using the platform. This is a design constraint on the data model, not a policy statement'],
    ['C8', 'External sources behind adapters', 'Tariff, exchange-rate and border data sources are unreliable and may change. All external access shall pass through adapter interfaces with a curated fallback dataset'],
    ['C9', 'Single-developer, single-semester capacity', 'The project is delivered by one developer across four releases. Anything outside the R1–R4 roadmap goes to the product backlog rather than into scope'],
    ['C10', 'Language set fixed for version 1.0', 'English, French, Kiswahili and Kinyarwanda. Adding a language must require translation resources only, never code changes'],
  ], { size: 19 }));
  c.push(CAP('Table 2.5. Design and implementation constraints.'));

  c.push(H2('2.6 User Documentation'));
  c.push(P('Documentation is a deliverable of the product, not an afterthought, and its form is dictated by the user class it serves. A printed manual would be useless to the primary user; in-context guidance and a printable checklist are not.'));
  c.push(mkTable([2300, 2200, 4860], [
    ['Component', 'Audience', 'Description and delivery'],
    ['In-app contextual help', 'Trader', 'Short explanations attached to each checklist item, cost line and border status, answering “what is this and why does it apply to me?” in the user’s selected language. Delivered inline; never a separate manual'],
    ['First-use walkthrough', 'Trader', 'A three-step guided introduction on first launch, skippable and repeatable, covering how to state a consignment, read a checklist and read a cost estimate'],
    ['Printable trade plan', 'Trader', 'The checklist and cost estimate exported as a one-page printable PDF and as a plain-text summary suitable for SMS or WhatsApp, so that the plan can be carried and presented on paper at the border (FR-REQ-05)'],
    ['Illustrated quick-reference card', 'Trader', 'A single-page, largely pictorial guide in all four supported languages, distributed through trader cooperatives for users with limited literacy'],
    ['Provider guide', 'Transport provider, buyer/supplier', 'A short guide to verification, publishing a listing and responding to requests, delivered in-app and as a downloadable PDF'],
    ['Administrator handbook', 'Administrator', 'Procedures for creating, attributing, versioning and publishing regulatory rules, for handling re-verification queues, and for moderation. Includes the four-eyes review procedure for rule publication'],
    ['Technical documentation', 'Developers, maintainers', 'OpenAPI specification for all public endpoints, kept current with the implementation (NFR-MNT-04), plus a repository README enabling a new developer to build and run the system locally within two hours (NFR-MNT-06)'],
  ], { size: 19 }));
  c.push(CAP('Table 2.6. User documentation components.'));
  c.push(P('All trader-facing documentation is subject to the same readability requirement as the interface: a reading level no higher than that appropriate to a twelve-year-old reader in each supported language (NFR-USA-03).'));

  c.push(H2('2.7 Assumptions and Dependencies'));

  c.push(H3('2.7.1 Assumptions'));
  c.push(P('The following are believed true and are not verified by this project. If any proves false, the requirements that depend on it are affected as stated.'));
  c.push(mkTable([700, 3800, 4860], [
    ['#', 'Assumption', 'Consequence if false'],
    ['A1', 'Target traders have access, directly or through a family member, to an internet-capable phone', 'The USSD/SMS fallback (NFR-USA-07) becomes the primary channel rather than a secondary one, and the PWA becomes a minority interface'],
    ['A2', 'Authoritative regulatory content for the pilot corridor can be obtained and kept reasonably current', 'The product cannot meet its accuracy obligations (NFR-ACC-01…06) and the core value proposition fails. This is the single most important assumption in the document'],
    ['A3', 'Traders will trust a third-party platform enough to act on its output', 'Adoption fails regardless of correctness. Mitigated by citing the source and verification date of every rule so that trust is not required, only verifiable'],
    ['A4', 'Border and customs authorities will tolerate a tool that makes their published rules more legible', 'Official status publication (FR-BRD-04) becomes unavailable and the system relies solely on community reports'],
    ['A5', 'Connectivity is intermittent rather than absent', 'Offline caching is insufficient and the fallback channel becomes essential. Note that telecommunications shutdowns have occurred around recent elections in the region (tralac, 2026)'],
    ['A6', 'A minimum population of verified providers and counterparties can be recruited', 'The matching and discovery modules (FR-TRN, FR-MKT) deliver no value. This is why they are sequenced into R3 rather than R1: the checklist and cost functions are useful with a single user'],
    ['A7', 'Regional trade rules will continue to change during and after development', 'Assumed true rather than false. This assumption is why constraint C1 exists'],
  ], { size: 19 }));
  c.push(CAP('Table 2.7. Assumptions.'));

  c.push(H3('2.7.2 Dependencies'));
  c.push(mkTable([2400, 3200, 3760], [
    ['Dependency', 'Nature', 'Mitigation if unavailable'],
    ['Tariff and duty schedules', 'External data, per jurisdiction', 'Curated manual dataset for the pilot corridor, maintained by an administrator under FR-ADM-01'],
    ['EAC Simplified Trade Regime product lists', 'External data, per jurisdiction', 'Manually transcribed and version-controlled; the eligibility test degrades to “cannot determine” rather than guessing'],
    ['Exchange rate source', 'External API', 'Cached rate with its age displayed, per NFR-REL-04 and NFR-ACC-03'],
    ['SMS gateway', 'External service', 'Required for account verification (FR-ACC-02); no fallback exists, so gateway selection carries availability risk'],
    ['Border operating information', 'External and crowdsourced', 'Community reports (FR-BRD-03) supply coverage where official publication is absent'],
    ['Trader cooperatives and associations', 'Organisational', 'Required for recruitment, field research and usability testing. Engaged from Sprint 0 rather than at testing time'],
    ['Cloud hosting and container orchestration', 'Infrastructure', 'Configuration is externalised so the system may be redeployed to another provider (NFR-CMP-04)'],
  ], { size: 19 }));
  c.push(CAP('Table 2.8. External dependencies.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // =========== 3. EXTERNAL INTERFACE REQUIREMENTS ===========
  c.push(H1('3. External Interface Requirements'));
  c.push(P('This section specifies the boundaries across which BorderBridge exchanges information with people, devices, other software and networks.'));

  c.push(H2('3.1 User Interfaces'));
  c.push(P('The trader interface is the product’s principal risk surface, because the user class it serves has low literacy tolerance, a small screen and an expensive connection. The following are obligations on that interface.'));
  c.push(mkTable([700, 3200, 5460], [
    ['#', 'Interface requirement', 'Detail'],
    ['UI-01', 'Task-oriented structure', 'The interface shall be organised around the trade intention as the single entry point, not around a menu of features. The primary screen shall present one question: where from, where to, what, how much'],
    ['UI-02', 'Progressive disclosure', 'Each checklist item, cost line and border status shall present a short primary statement, with the governing rule, citation and verification date available on expansion rather than displayed by default'],
    ['UI-03', 'Language selection', 'A language selector shall be reachable from every screen, offering English, French, Kiswahili and Kinyarwanda, and the choice shall persist across sessions (FR-LOC-01)'],
    ['UI-04', 'Non-colour status encoding', 'Every status indicator shall carry an icon or text label in addition to colour, so that meaning survives greyscale rendering and colour vision deficiency (NFR-USA-05)'],
    ['UI-05', 'Touch targets and contrast', 'Interactive elements shall be at least 44 × 44 CSS pixels, and body text shall meet a contrast ratio of at least 4.5:1, per WCAG 2.2 Level AA (NFR-USA-04)'],
    ['UI-06', 'Offline state visibility', 'The interface shall indicate clearly when content is being served from cache and shall display the age of that content rather than presenting stale data as current'],
    ['UI-07', 'Error presentation', 'Every error message shall state what went wrong and what the user should do next, in the selected language, without exposing technical detail, stack traces or identifiers (NFR-USA-06)'],
    ['UI-08', 'Advisory statement', 'Every cost estimate screen shall carry a persistent, non-dismissible statement that the estimate is guidance and not a binding determination by a customs authority (FR-CST-04)'],
    ['UI-09', 'Printable and shareable output', 'The trade plan shall be exportable as a one-page printable PDF and as a plain-text summary suitable for SMS or messaging applications (FR-REQ-05)'],
    ['UI-10', 'Administrative interface', 'The administrative interface shall be a separate, desktop-oriented surface, and shall require server-side role verification on every action rather than relying on client-side restriction (NFR-SEC-04)'],
  ], { size: 19 }));
  c.push(CAP('Table 3.1. User interface requirements.'));
  c.push(P('A USSD and SMS interface shall provide the checklist and cost-estimate functions for users without a data connection or a smartphone (NFR-USA-07). Because USSD sessions are short and menu-driven, this interface presents a reduced flow: corridor, product category, approximate value, and a returned summary, with the full itemisation available by SMS on request.'));

  c.push(H2('3.2 Hardware Interfaces'));
  c.push(P('BorderBridge requires no bespoke hardware and no peripheral device. Its hardware interfaces are those of a standard mobile handset, accessed through the browser’s device APIs, and each is optional.'));
  c.push(mkTable([2200, 3200, 3960], [
    ['Hardware', 'Interface and access method', 'Use and degradation'],
    ['Mobile handset (primary)', 'Standard Android or iOS device running a modern browser. No native application, no app-store distribution', 'The full client. Minimum reference device is an entry-level Android handset on Android 8.0'],
    ['Device storage', 'Browser storage APIs via the service worker', 'Offline caching of trade plans, checklists and border details (NFR-REL-02). Where storage is unavailable or full, the application shall continue to operate online-only and inform the user'],
    ['Location sensor (GPS)', 'W3C Geolocation API, on explicit user permission only', 'Optional. Used to suggest the nearest border crossing and to pre-fill a border condition report. Where permission is refused or unavailable, the user selects the crossing manually. Location is never collected in the background'],
    ['Camera', 'HTML media capture, on explicit user permission only', 'Optional, deferred beyond version 1.0. Intended for attaching a photograph of an obtained document to a checklist item. Where unavailable, checklist items are marked obtained without evidence'],
    ['Feature phone', 'GSM network via USSD and SMS, with no browser involvement', 'The fallback channel. Provides checklist and cost estimation only; matching, tracking and discovery are unavailable on this channel'],
    ['Server hardware', 'Virtualised compute in a container orchestration platform', 'No physical hardware dependency. Services are stateless so that capacity is added horizontally (NFR-SCA-02)'],
  ], { size: 19 }));
  c.push(CAP('Table 3.2. Hardware interfaces.'));

  c.push(H2('3.3 Software Interfaces'));
  c.push(P('All external software interfaces are accessed through adapter interfaces, so that a source may be replaced without change to domain logic (NFR-CMP-05). Each adapter defines its own degradation behaviour, because every one of these sources is expected to be unavailable at some point.'));
  c.push(mkTable([1900, 1500, 2400, 3560], [
    ['External system', 'Direction', 'Data exchanged', 'Interface and failure behaviour'],
    ['Exchange rate service', 'Inbound', 'Currency pair rates with retrieval timestamp', 'Scheduled polling over HTTPS/JSON. On failure, the most recent cached rate is used and its age is displayed to the trader (NFR-REL-04, NFR-ACC-03). The estimate is still produced'],
    ['Tariff and duty schedule sources', 'Inbound', 'HS-code-indexed duty, tax and fee rates', 'Where a machine-readable source exists, scheduled ingestion with validation; otherwise administrator-curated entry via FR-ADM-01. Ingested rates enter as draft rule versions and require publication (FR-ADM-02) before they affect trader output'],
    ['National trade information portals', 'Inbound', 'Procedure and document requirement content, used as an authoritative source for rule authoring', 'Consumed as reference material by administrators rather than machine-ingested in version 1.0. Attribution is recorded against each derived rule (FR-ADM-03)'],
    ['SMS gateway', 'Outbound', 'Verification codes, alerts, plain-text trade plan summaries', 'HTTPS/REST with delivery-receipt callbacks. On failure, verification cannot proceed; the system shall queue and retry, and shall inform the user rather than failing silently'],
    ['USSD aggregator', 'Bidirectional', 'Session menu state and responses', 'Session-based HTTP callbacks. Sessions are short-lived and stateless between requests; session state is reconstructed server-side from the session identifier'],
    ['Push notification service', 'Outbound', 'Border, regulatory and shipment alerts', 'Web Push over HTTPS. On failure, alerts degrade to in-app notification and, where the user has subscribed to it, SMS'],
    ['Relational database', 'Bidirectional', 'All persistent application data', 'PostgreSQL over an encrypted connection, accessed through a data access layer with parameterised queries (NFR-SEC-06)'],
    ['Object storage', 'Bidirectional', 'Generated PDF exports and, in later releases, document images', 'S3-compatible API over HTTPS. Not required for core checklist or cost functions'],
  ], { size: 19 }));
  c.push(CAP('Table 3.3. Software interfaces.'));
  c.push(P('BorderBridge exposes its own documented HTTP/JSON API, specified in OpenAPI and kept current with the implementation (NFR-MNT-04). No external party consumes this API in version 1.0; it exists to separate client from server and to make the system integrable later, for instance by a national trade portal wishing to embed the eligibility test.'));

  c.push(H2('3.4 Communications Interfaces'));
  c.push(mkTable([2100, 2600, 4660], [
    ['Interface', 'Protocol and standard', 'Requirement'],
    ['Client to server', 'HTTPS over TLS 1.2 or higher, HTTP/2 where available', 'All traffic shall be encrypted in transit; plaintext HTTP shall be refused, not redirected silently (NFR-SEC-01). Request and response bodies shall be JSON and shall be compressed'],
    ['Offline synchronisation', 'Service worker background sync over HTTPS', 'Actions taken offline shall be queued locally and synchronised when connectivity returns, without data loss and without duplicate submission. Each queued action shall carry an idempotency key so that a retried request cannot be applied twice (NFR-REL-03)'],
    ['Data economy', 'HTTP compression and payload budgeting', 'The initial application payload shall not exceed 500 KB compressed and a typical checklist interaction shall not exceed 100 KB of transfer (NFR-PER-04). This is a communications obligation because the user pays per megabyte'],
    ['SMS', 'SMPP or HTTPS/REST via the gateway, GSM 03.38 character set', 'Messages shall fit the character constraints of the destination network and shall be composed in the user’s selected language. Long content shall be truncated with a clear continuation indicator rather than silently cut'],
    ['USSD', 'Session-based interaction via the aggregator', 'Menu depth shall be limited so that the core checklist flow completes within a standard session timeout. The interface shall not depend on session persistence between dial-ins'],
    ['Push notifications', 'Web Push, VAPID authenticated', 'Notification payloads shall contain no personal data and no regulatory detail, only enough to prompt the user to open the application'],
    ['Server to external services', 'HTTPS with certificate validation', 'All outbound integration traffic shall validate certificates, apply timeouts, and fail to a defined degradation path rather than blocking a user request indefinitely'],
    ['Administrative access', 'HTTPS with role-based authorisation', 'Administrative endpoints shall verify role membership server-side on every request (NFR-SEC-04) and all actions shall be written to an append-only audit log (NFR-SEC-07)'],
  ], { size: 19 }));
  c.push(CAP('Table 3.4. Communications interfaces.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));
};
