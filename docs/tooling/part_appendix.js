// Appendix A (glossary) and Appendix B (UML diagrams).
// Pushes into three section arrays so the sequence diagram can sit on a landscape page.
const L = require('./lib_doc');
const { d, P, PR, H1, H2, H3, H4, BULLET, REF, mkTable, CAP, NOTE } = L;
const { Paragraph, PageBreak } = d;

module.exports = function appendices(S1, S2, S3, fig) {
  let c = S1;

  // ===== APPENDIX A =====
  c.push(H1('6. Appendix'));
  c.push(P('This section contains the supporting material referenced throughout the specification: a glossary of domain and technical terms (Appendix A) and the UML models of the system (Appendix B).'));

  c.push(H2('6.1 Appendix A — Glossary'));
  c.push(mkTable([1700, 7660], [
    ['Term', 'Definition'],
    ['AfCFTA', 'African Continental Free Trade Area — the continental agreement establishing a single market for goods and services among participating African Union member states'],
    ['Certificate of Origin', 'Document attesting the country in which goods were produced, used to establish eligibility for preferential tariff treatment'],
    ['Corridor', 'An origin–destination country pair together with the border crossings that serve it'],
    ['EAC', 'East African Community — the regional economic community comprising, among others, Rwanda, Uganda, Kenya, Tanzania and Burundi'],
    ['HS Code', 'Harmonized System code — the international standard for classifying traded products, used to resolve duty rates and product-specific requirements'],
    ['ICBT', 'Informal Cross-Border Trade — cross-border trade unrecorded in official statistics, estimated at roughly USD 40 billion annually across Africa (ECA, 2023)'],
    ['Landed cost', 'The total cost of delivering a consignment to its destination, including product value, transport, duties, taxes and administrative fees'],
    ['MoSCoW', 'A prioritisation scheme classifying requirements as Must have, Should have, Could have or Won’t have this time'],
    ['NTB', 'Non-Tariff Barrier — a non-tariff obstacle to trade such as documentation complexity, inconsistent procedure or delay'],
    ['PWA', 'Progressive Web Application — a web application that can be installed and can operate offline via a service worker'],
    ['RPO / RTO', 'Recovery Point Objective (maximum tolerable data loss) and Recovery Time Objective (maximum tolerable outage duration)'],
    ['Shipment', 'A persisted, trackable instance of a planned or executed cross-border movement within BorderBridge'],
    ['SRS', 'Software Requirements Specification — this document'],
    ['STR', 'Simplified Trade Regime — an EAC arrangement exempting qualifying consignments below USD 2,000 from full customs declaration procedures'],
    ['Trade intention', 'A stated intent to move a specific product, in a specific quantity, along a specific corridor; the input from which a trade plan is derived'],
    ['Trade plan', 'The composite output of the system for a trade intention: checklist, cost estimate, border recommendation and matched services'],
    ['USSD', 'Unstructured Supplementary Service Data — a GSM protocol enabling menu-driven interaction from any mobile handset without an internet connection'],
    ['WCAG', 'Web Content Accessibility Guidelines — the W3C standard for accessible web content'],
  ], { size: 19 }));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ===== APPENDIX B =====
  c.push(H2('6.2 Appendix B — UML Diagrams'));

  c.push(H4('B.0 Purpose and selection of diagram types'));
  c.push(P('This appendix models the BorderBridge system using four types of UML diagram. Every element is annotated with the functional requirement identifier it realises, so that traceability runs unbroken from the requirement statements in Section 4, through these models, to the design and test artefacts that follow.'));
  c.push(P('The four types cover both halves of UML. Structural diagrams answer the question “what does the system consist of?”; behavioural diagrams answer “what does the system do, and in what order?”. A system whose value lies in a sequence of correct decisions about a consignment needs more behavioural modelling than structural, so the balance is deliberately weighted that way.'));
  c.push(mkTable([1200, 1900, 1500, 4760], [
    ['Figure', 'Diagram type', 'Category', 'Question it answers'],
    ['B.1a, B.1b', 'Use case diagram', 'Behavioural', 'Who uses the system, what goals can they achieve, and how do those goals depend on one another?'],
    ['B.2a, B.2b', 'Class diagram', 'Structural', 'What entities does the system hold, what data do they carry, and how are they related?'],
    ['B.3', 'Sequence diagram', 'Behavioural', 'In what order do system components exchange messages to produce a trade plan, and what happens when a step fails?'],
    ['B.4a, B.4b', 'Activity diagram', 'Behavioural', 'What is the end-to-end workflow, including its decision points, parallel work and loops?'],
  ], { size: 19 }));
  c.push(CAP('Table B.1. The four UML diagram types used, and the modelling question each answers.'));
  c.push(NOTE('Note on diagram count. Seven figures are presented, but they constitute four diagram types. Two use case diagrams, two class diagrams and two activity diagrams are each split purely for legibility — a single diagram covering all six actors, all twenty-four domain classes, or the full end-to-end workflow would be unreadable at page size. In accordance with the assignment specification, multiple diagrams of the same kind count as one type. The four types are: use case, class, sequence and activity.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- B.1 USE CASE ----------
  c.push(H3('B.1 Use Case Diagrams (Behavioural)'));

  c.push(H4('B.1.1 What a use case diagram represents'));
  c.push(P('A use case diagram models the functional scope of a system from the outside in. It shows actors — the people, organisations or systems outside the system boundary — and use cases, which are the goals those actors achieve by using the system. It deliberately says nothing about internal structure or ordering; its job is to establish who the system serves and what it is for.'));
  c.push(P('Three notations carry the meaning:'));
  c.push(BULLET('A solid line between an actor and a use case is an association: that actor participates in that use case. The actor at the tail is the primary actor whose goal the use case serves.'));
  c.push(BULLET('A dashed arrow labelled «include» means the source use case always invokes the target as part of its normal execution. Creating a trade intention, for example, always generates a checklist — it is not optional.'));
  c.push(BULLET('A dashed arrow labelled «extend» means the source adds optional behaviour to the target under some condition. Exporting a checklist extends checklist generation: a trader may export, but need not.'));
  c.push(P('The rectangle labelled BorderBridge is the system boundary. Everything inside it is the responsibility of the software; the actors outside it are not.'));

  c.push(H4('B.1.2 Figure B.1a — Trader-facing functions'));
  c.push(fig('B1a_use_case_trader.png', 624, 780, 'Use case diagram of BorderBridge trader-facing functions, showing the Trader and Scheduler actors and four packages of use cases with include and extend relationships.'));
  c.push(CAP('Figure B.1a. Use case diagram — functions available to the trader, the system’s primary actor.'));

  c.push(H4('Actors'));
  c.push(mkTable([1900, 2200, 5260], [
    ['Actor', 'Type', 'Goal in this diagram'],
    ['Trader', 'Primary, human', 'To find out what a specific consignment on a specific route will require and cost, and to prepare for the crossing accordingly'],
    ['Scheduler (system)', 'Secondary, automated', 'To dispatch regulatory, border and shipment alerts without human initiation; drawn as an actor because it triggers behaviour from outside any user session'],
  ], { size: 19 }));

  c.push(H4('Flow and connections represented'));
  c.push(P('The diagram is organised into four packages corresponding to the module structure of Section 4.'));
  c.push(BULLET('Account and Identity. The trader registers (FR-ACC-01), which always includes verification by one-time SMS code (FR-ACC-02) — hence the «include». Authentication (FR-ACC-03) and profile management (FR-ACC-05) are separate entry points for a returning trader.'));
  c.push(BULLET('Trade Planning. This is the heart of the diagram. Create Trade Intention (FR-REQ-01) is the single entry point from which the entire plan derives, and it includes three things unconditionally: checklist generation (FR-REQ-02), cost estimation (FR-CST-01) and border recommendation (FR-BRD-01). Checklist generation in turn includes the simplified-regime eligibility test (FR-REQ-03), and cost estimation includes currency conversion (FR-CST-02). Export (FR-REQ-05) and completion tracking (FR-REQ-04) extend checklist generation, because a trader may or may not use them.'));
  c.push(BULLET('Corridor and Border. Recommend Border Crossing (FR-BRD-01) is reached through the include from trade planning rather than as a standalone goal, whereas Report Border Condition (FR-BRD-03) is a direct trader action — the crowdsourcing loop that keeps border status current.'));
  c.push(BULLET('Shipment and Alerts. Create Shipment (FR-SHP-01) includes checklist generation, because a shipment cannot exist without the plan it snapshots. Dispatch Alerts (FR-NOT-02/03/04) is driven by the Scheduler, not the trader, which is why that association originates outside the human actor.'));

  c.push(H4('Inputs and outputs'));
  c.push(mkTable([2600, 3300, 3460], [
    ['Use case', 'Input', 'Output'],
    ['Create Trade Intention', 'Origin and destination country, product, quantity or declared value', 'A persisted trade intention with a unique reference'],
    ['Generate Document Checklist', 'Trade intention, trader profile, active regulatory rule set', 'An ordered checklist with issuing authority, source citation and last-verified date per item'],
    ['Determine STR Eligibility', 'Declared value, product classification, corridor, STR product list', 'An eligibility determination with a plain-language explanation and cited threshold'],
    ['Estimate Landed Cost', 'Trade intention, duty and tax rates, transport rates', 'An itemised estimate with a confidence range'],
    ['Recommend Border Crossing', 'Trade intention, crossing register, official status, community reports', 'A ranked list of crossings with the ranking rationale'],
    ['Report Border Condition', 'Crossing, condition category, estimated waiting time', 'An updated aggregate community status visible to other traders'],
  ], { size: 19 }));
  c.push(CAP('Table B.2. Inputs and outputs of the principal trader-facing use cases.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  c.push(H4('B.1.3 Figure B.1b — Providers, officials and administration'));
  c.push(fig('B1b_use_case_supply.png', 624, 780, 'Use case diagram of BorderBridge provider, customs officer and administrator functions across transport marketplace, buyer discovery, border authority and administration packages.'));
  c.push(CAP('Figure B.1b. Use case diagram — the supply side of the marketplace, border authority functions, and administration.'));

  c.push(H4('Actors'));
  c.push(mkTable([1900, 2200, 5260], [
    ['Actor', 'Type', 'Goal in this diagram'],
    ['Transport Provider', 'Primary, human', 'To fill unused capacity on cross-border routes by publishing availability and responding to requests'],
    ['Buyer / Supplier', 'Primary, human', 'To be discoverable to traders in the neighbouring market and contacted about specific consignments'],
    ['Trader', 'Primary, human', 'Appears here as the demand side: searching for transport, discovering counterparties, reporting bad listings'],
    ['Customs Officer', 'Primary, human', 'To publish authoritative border status, which takes precedence over community reports'],
    ['Administrator', 'Primary, human', 'To keep the regulatory knowledge base accurate and to police the integrity of user-generated content'],
  ], { size: 19 }));

  c.push(H4('Flow and connections represented'));
  c.push(BULLET('Transport Marketplace. A provider publishes capacity (FR-TRN-01), which includes provider verification (FR-ACC-06) — an unverified listing is withheld from search, so verification is a precondition of publication rather than an optional extra. The trader searches (FR-TRN-02) and requests (FR-TRN-03); the request includes the provider’s response (FR-TRN-04), because a request is not complete until it is accepted, declined or countered. Both parties may rate the engagement afterwards (FR-TRN-05).'));
  c.push(BULLET('Buyer and Supplier Discovery. Publishing a market listing (FR-MKT-01) likewise includes verification. Discovery (FR-MKT-02) is extended by Initiate Contact (FR-MKT-03), since a trader may browse without contacting anyone. Reporting a listing (FR-MKT-04) includes moderation (FR-ADM-05), the mechanism by which a report becomes an administrative decision.'));
  c.push(BULLET('Border Authority. The Customs Officer publishes official status (FR-BRD-04). This is a separate actor and package because the officer is not a trader: their interaction is read-oriented and authoritative, and their published status overrides the crowdsourced aggregate.'));
  c.push(BULLET('Administration. Maintaining a rule (FR-ADM-01) includes maintaining its source attribution (FR-ADM-03) — the system refuses to save a rule without a citation, so the two are inseparable. Publishing a change (FR-ADM-02) extends rule maintenance, marking the deliberate split between drafting and activating a rule. Re-verification flagging (FR-ADM-04) is scheduled work that keeps the knowledge base from silently going stale.'));

  c.push(H4('Why the actor split matters'));
  c.push(P('Separating these actors is not cosmetic. Section 5.2 requires role-based access control enforced server-side (NFR-SEC-04), and this diagram is the source of that requirement: it establishes that publishing an official border status is a Customs Officer capability and publishing a regulatory change is an Administrator capability, neither of which any trader may perform regardless of what the client interface offers.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- B.2 CLASS ----------
  c.push(H3('B.2 Class Diagrams (Structural)'));

  c.push(H4('B.2.1 What a class diagram represents'));
  c.push(P('A class diagram models the static structure of the system: the classes of object it holds, the attributes and operations each carries, and the relationships between them. Unlike the behavioural diagrams it says nothing about time or order — it describes what is true of the system at any moment.'));
  c.push(mkTable([2000, 7360], [
    ['Notation', 'Meaning'],
    ['Class box, three compartments', 'Name, then attributes (name : type), then operations (name(parameters) : return type)'],
    ['Italic class name, marked {A}', 'An abstract class, which cannot itself be instantiated. User is abstract because every user is of a concrete role'],
    ['Hollow triangle arrowhead', 'Generalisation, read as “is a”. Trader is a User and inherits its attributes and operations'],
    ['Filled diamond', 'Composition, a strong whole–part relationship. The part cannot exist without its whole: deleting a Checklist deletes its ChecklistItems'],
    ['Hollow diamond', 'Aggregation, a weaker whole–part relationship. A BorderCrossing belongs to a Corridor but has an independent existence'],
    ['Plain arrow', 'A directed association — one class holds a reference to and can navigate to another'],
    ['Dashed arrow', 'A dependency — one class uses another transiently, without holding a reference to it'],
    ['1, 0..1, 0..*, 1..*', 'Multiplicity: exactly one, at most one, any number including none, at least one'],
    ['- and +', 'Private and public visibility respectively'],
  ], { size: 19 }));
  c.push(CAP('Table B.3. UML class diagram notation used in this appendix.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  c.push(H4('B.2.2 Figure B.2a — Users, trade planning and the regulatory knowledge base'));
  c.push(fig('B2a_class_core.png', 624, 780, 'Class diagram of the BorderBridge core domain: an abstract User class with five role subclasses, the trade planning chain from TradeIntention through Checklist and CostEstimate, and the versioned RegulatoryRule knowledge base.'));
  c.push(CAP('Figure B.2a. Class diagram — the core domain model.'));

  c.push(H4('Structure represented'));
  c.push(P('The diagram is divided into three packages reflecting three different rates of change. User data changes when people join. Trade planning data is created fresh for every consignment. Regulatory data changes when the law does — independently of both — which is precisely why it is modelled as its own package rather than as attributes scattered across the others.'));

  c.push(H4('The user hierarchy'));
  c.push(P('User is abstract and holds everything common to all roles: identity, credentials, verification state, language preference, and the operations for authentication and credential recovery (FR-ACC-03, FR-ACC-04). Five concrete subclasses inherit from it. This is a generalisation hierarchy rather than a role attribute because the roles carry genuinely different data and behaviour: only Trader holds an encrypted national identification number and can create a trade intention; only Administrator can publish a regulatory rule. Modelling roles as subclasses is what makes NFR-SEC-04 enforceable at the type level rather than by runtime string comparison.'));

  c.push(H4('The trade planning chain'));
  c.push(P('The central relationship chain models the problem this system exists to solve, and reads as a single sentence:'));
  c.push(NOTE('A Trader creates zero or more TradeIntentions. Each TradeIntention concerns exactly one Product and travels exactly one Corridor, and yields at most one Checklist and at most one CostEstimate. A Checklist contains one or more ChecklistItems; a CostEstimate itemises one or more CostLines. Every ChecklistItem and every CostLine is derived from exactly one RegulatoryRule.'));
  c.push(P('Three modelling decisions in that chain deserve explanation:'));
  c.push(BULLET('Checklist and CostEstimate are compositions of TradeIntention (filled diamonds). They have no meaning apart from the intention that produced them, and deleting the intention must delete them. This also prevents a stale checklist from outliving the consignment it described.'));
  c.push(BULLET('The multiplicity on Checklist is 0..1, not 1. A trade intention exists the moment the trader submits it, but the checklist is generated afterwards and may fail to generate if the corridor has no loaded rule content. The model must permit that intermediate state rather than pretending it cannot occur.'));
  c.push(BULLET('ChecklistItem and CostLine both point to RegulatoryRule rather than copying its text. This single relationship is what makes NFR-ACC-01 achievable: because every item retains a live reference to the versioned rule it came from, the interface can always display the governing citation and its last-verified date, and FR-ADM-04 can identify exactly which trader-facing output is affected when a rule falls overdue for re-verification.'));

  c.push(H4('The regulatory knowledge base'));
  c.push(P('RegulatoryRule carries a version number, an effective date, a source citation and a last-verified date, and exposes isCurrent(). It is modelled as versioned data rather than as application code because regulatory volatility is a certainty in this domain (constraint C1), and because NFR-ACC-05 requires that the exact rule set applied to any historical shipment can be reconstructed. ExchangeRate similarly records retrievedAt and exposes isStale(), which is the model-level basis for the 24-hour freshness requirement in NFR-ACC-03.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  c.push(H4('B.2.3 Figure B.2b — Fulfilment, corridor operations and notification'));
  c.push(fig('B2b_class_fulfilment.png', 624, 780, 'Class diagram of BorderBridge fulfilment: Shipment with its event history and transport request, BorderCrossing with community reports, and the notification subscription classes.'));
  c.push(CAP('Figure B.2b. Class diagram — execution of a planned movement.'));

  c.push(H4('Structure represented'));
  c.push(P('Where Figure B.2a models planning, this diagram models execution: what happens once a trader commits to a movement.'));
  c.push(BULLET('Fulfilment. Shipment is the aggregate root. It composes one or more ShipmentEvents — an append-only history, which is why the relationship is a composition and the multiplicity is 1..* rather than 0..*: creating a shipment immediately writes its first event. Shipment exposes transitionTo(), the operation that enforces the state model in FR-SHP-02; invalid transitions are rejected at the domain layer, not merely hidden in the interface. A Shipment is optionally fulfilled by a TransportRequest, which targets exactly one TransportListing.'));
  c.push(BULLET('Corridor Operations. BorderCrossing composes zero or more BorderReports and exposes aggregateStatus(), which computes the community view. BorderReport carries both reportedAt and weight, and exposes isExpired(). Putting decay and expiry in the model rather than in a query is what makes FR-BRD-05 a structural guarantee: a stale report cannot be presented as current, because the object itself knows it is stale.'));
  c.push(BULLET('Notification. A Subscription records the corridors, crossings and delivery channels a user follows, and watches BorderCrossing — a dependency rather than an association, since a subscription references crossings by identifier without owning them. Each Subscription generates zero or more Notifications.'));

  c.push(H4('Cross-diagram relationships'));
  c.push(P('For legibility, the User classes appear only in Figure B.2a. The relationships spanning the two diagrams are stated here for completeness, and are implemented as ordinary associations:'));
  c.push(mkTable([3000, 1400, 4960], [
    ['Relationship', 'Multiplicity', 'Meaning'],
    ['Trader owns Shipment', '1 to 0..*', 'A shipment always belongs to exactly one trader; deleting the trader account cascades under NFR-PRI-03'],
    ['TransportProvider publishes TransportListing', '1 to 0..*', 'Listings are withheld from search until the provider is verified (FR-ACC-06)'],
    ['BuyerSupplier publishes MarketListing', '1 to 0..*', 'Listings expire automatically at the end of their validity period'],
    ['Trader holds Subscription', '1 to 0..1', 'One subscription set per trader, governing which events reach them (FR-NOT-01)'],
    ['User reports BorderReport', '1 to 0..*', 'Report weight is influenced by the reporter’s history'],
    ['CustomsOfficer publishes status on BorderCrossing', '1 to 0..*', 'Official status takes precedence over the community aggregate (FR-BRD-04)'],
  ], { size: 19 }));
  c.push(CAP('Table B.4. Relationships spanning Figures B.2a and B.2b.'));
  c.push(P('The application service classes that operate on this model — RequirementsEngine, CostEngine, BorderService, MatchingEngine and NotificationService — are deliberately omitted from both class diagrams, because they hold no state and therefore have no structural relationships worth drawing. They appear instead as lifelines in Figure B.3, which is where their behaviour belongs, and in the architectural decomposition in Table 2.1.'));

  // ---------- B.3 SEQUENCE (landscape) ----------
  c = S2;
  c.push(H3('B.3 Sequence Diagram (Behavioural)'));
  c.push(NOTE('This section is set in landscape orientation. The sequence diagram spans nine participants, and landscape gives it the width it needs to remain legible at page size.'));

  c.push(H4('B.3.1 What a sequence diagram represents'));
  c.push(P('A sequence diagram models one specific scenario as an ordered exchange of messages between participants. Time runs downwards. Each participant has a vertical lifeline; the narrow rectangles on a lifeline are activation bars, showing when that participant is doing work. Solid arrows are calls, dashed arrows are returns. Rectangular fragments labelled alt enclose alternative paths guarded by a condition — only one branch of an alt executes.'));
  c.push(P('The scenario modelled is the system’s most important one: a trader submits a consignment and receives a complete trade plan. It realises FR-REQ-01, FR-REQ-02, FR-REQ-03, FR-CST-01, FR-CST-02 and FR-BRD-01 in a single interaction.'));

  c.push(H4('B.3.2 Figure B.3 — Generating a trade plan'));
  c.push(fig('B3_sequence.png', 912, 672, 'Sequence diagram showing nine participants exchanging messages to generate a trade plan, across four phases: intention capture, checklist generation, cost estimation and border recommendation.'));
  c.push(CAP('Figure B.3. Sequence diagram — trader requests a trade plan for a specific consignment.'));

  c.push(H4('Participants'));
  c.push(mkTable([2200, 1900, 5260], [
    ['Participant', 'Layer', 'Responsibility in this scenario'],
    ['Trader', 'Actor', 'Supplies the consignment details and receives the plan'],
    ['PWA Client', 'Presentation', 'Collects input, calls the API, and caches the returned plan for offline use'],
    ['TradeService', 'Application', 'Orchestrates the scenario; owns the transaction and the ordering of the three engines'],
    ['Requirements Engine', 'Application', 'Resolves the applicable rules and builds the checklist'],
    ['Cost Engine', 'Application', 'Computes duties, taxes, fees and the converted landed total'],
    ['Border Service', 'Application', 'Ranks candidate crossings'],
    ['Rule Repository', 'Data', 'Returns the active, versioned rule set for a corridor and classification'],
    ['ExchangeRate Adapter', 'Integration', 'Isolates the external rate source, and degrades to a cached rate'],
    ['Database', 'Data', 'Persists the intention, the plan, and the reference data read along the way'],
  ], { size: 19 }));

  c.push(H4('Flow represented'));
  c.push(mkTable([1200, 2400, 5760], [
    ['Messages', 'Phase', 'What happens'],
    ['01–08', 'Intention capture', 'The trader submits the consignment; TradeService resolves the corridor and HS classification. An alt fragment handles the unsupported-corridor case: the scenario terminates with a 422 response and a plain-language message rather than a partial plan. Only in the supported branch is the TradeIntention persisted.'],
    ['09–14', 'Checklist generation', 'TradeService delegates to the Requirements Engine, which fetches the active versioned rule set. A nested alt implements FR-REQ-03: if the declared value is under USD 2,000 and the product appears on the qualifying list, the simplified requirement set is applied; otherwise the full customs set applies. Either way the returned checklist carries citations and verified dates.'],
    ['15–22', 'Cost estimation', 'The Cost Engine fetches rate rules, then requests an exchange rate. A second alt implements NFR-REL-04: if the external source is unavailable, the adapter returns a cached rate with its age and the estimate is still produced. The scenario degrades rather than failing — an important property for a user on an intermittent connection.'],
    ['23–32', 'Border recommendation and return', 'Border Service loads crossings with official status and current community reports, ranks them, and returns. The composed plan is persisted, returned to the client, and cached locally for offline access under NFR-REL-02 before being displayed.'],
  ], { size: 19 }));
  c.push(CAP('Table B.5. Phases of the trade plan generation sequence.'));

  c.push(H4('Design decisions the diagram makes visible'));
  c.push(BULLET('TradeService orchestrates; the engines do not call one another. This keeps the engines independently testable and supports the 80% domain coverage target in NFR-MNT-01.'));
  c.push(BULLET('Both failure modes are modelled explicitly rather than left as exception handling. An unsupported corridor terminates cleanly; an unavailable rate source degrades to a cached value with its age disclosed. Neither produces a blank screen or a silent wrong answer.'));
  c.push(BULLET('The exchange rate is read through an adapter, never directly. This is the structural expression of NFR-CMP-05 and constraint C8: the external source can be replaced without touching domain logic.'));
  c.push(BULLET('Caching happens on the client after the response, not on the server. That placement is what makes the plan readable later with no connectivity at all.'));

  c.push(H4('Inputs and outputs of the scenario'));
  c.push(mkTable([2200, 7160], [
    ['Aspect', 'Detail'],
    ['Trigger', 'Trader submits origin, destination, product and quantity'],
    ['Inputs', 'Consignment details; trader profile; active regulatory rule set; duty, tax and fee schedules; exchange rate; border crossing register; current community reports'],
    ['Primary output', 'A TradePlan comprising a document checklist, an itemised cost estimate with confidence range, and a ranked list of border crossings'],
    ['Secondary outputs', 'A persisted TradeIntention; a client-side offline cache entry'],
    ['Alternative outcome', 'HTTP 422 with an out-of-coverage message where the corridor is unsupported'],
    ['Postconditions', 'The trade intention is durable and may be converted to a Shipment (FR-SHP-01); the plan is readable offline'],
  ], { size: 19 }));
  c.push(CAP('Table B.6. Inputs, outputs and postconditions of the trade plan scenario.'));

  // ---------- B.4 ACTIVITY (portrait) ----------
  c = S3;
  c.push(H3('B.4 Activity Diagram (Behavioural)'));

  c.push(H4('B.4.1 What an activity diagram represents'));
  c.push(P('An activity diagram models a workflow as a flow of control through actions. Where the sequence diagram shows one scenario message by message, the activity diagram shows the whole process including every branch — which makes it the right tool for a workflow whose value lies in its decisions.'));
  c.push(P('The workflow is presented in two parts, Figures B.4a and B.4b, which form one continuous flow. The notation used in both:'));
  c.push(mkTable([2400, 6960], [
    ['Notation', 'Meaning'],
    ['Vertical swimlanes', 'Partitions showing which participant is responsible for each action'],
    ['Filled circle / circled dot', 'Initial node (start) and final node (end) of the flow'],
    ['Rounded rectangle', 'An action — a single step of work'],
    ['Diamond', 'A decision node (branching) or a merge node (rejoining), with guard conditions on the outgoing edges'],
    ['Thick horizontal bar', 'A fork, splitting control into parallel flows, or a join, synchronising them again'],
    ['Loop back to a merge', 'Iteration — the flow repeats until the guard condition is satisfied'],
  ], { size: 19 }));

  c.push(H4('B.4.2 Figure B.4a — Planning: from trade intention to presented plan'));
  c.push(fig('B4a_activity_planning.png', 624, 780, 'Activity diagram, part one: swimlanes for Trader, System and Requirements Engine covering corridor resolution, simplified trade regime eligibility decisions, checklist assembly, and a parallel fork for cost and border ranking.'));
  c.push(CAP('Figure B.4a. Activity diagram, part 1 — resolving the corridor, determining simplified-regime eligibility, assembling the checklist, and computing cost and crossing in parallel.'));
  c.push(P('This first part covers everything that happens before the trader commits. It ends at one of three outcomes: the corridor is unsupported and the flow terminates; the trader reviews the plan and abandons or revises it; or the trader accepts and continues into Figure B.4b.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  c.push(H4('B.4.3 Figure B.4b — Preparation and fulfilment: from accepted plan to border-ready shipment'));
  c.push(fig('B4b_activity_fulfilment.png', 624, 780, 'Activity diagram, part two: shipment creation, the iterative document-gathering loop with readiness recalculation, transport request handling, and departure to the border.'));
  c.push(CAP('Figure B.4b. Activity diagram, part 2 — shipment creation, the iterative document-gathering loop, transport engagement, and departure.'));
  c.push(P('The second part covers execution. Its dominant feature is the document-gathering loop, which in practice is where the trader spends the bulk of real-world elapsed time. The two parts form one continuous workflow and are split only for legibility at page size.'));

  c.push(H4('Swimlanes'));
  c.push(mkTable([2200, 7160], [
    ['Partition', 'Responsibility'],
    ['Trader', 'All human judgement and physical action: stating the intention, reviewing the plan, obtaining documents, choosing transport, travelling'],
    ['System', 'Orchestration, persistence, cost and border computation, status management and notification'],
    ['Requirements Engine', 'Rule resolution and the simplified-regime determination — separated because this is the decision logic that carries the greatest consequence for the trader'],
  ], { size: 19 }));

  c.push(H4('Decision points'));
  c.push(P('Seven decisions shape the workflow across the two parts. Each corresponds to a requirement in Section 4.'));
  c.push(mkTable([2600, 1300, 1100, 4360], [
    ['Decision', 'Requirement', 'Figure', 'Effect on the flow'],
    ['Corridor supported?', 'FR-REQ-01', 'B.4a', 'If not, the flow terminates immediately with a coverage message. No partial plan is produced'],
    ['Any rule overdue for re-verification?', 'FR-ADM-04', 'B.4a', 'Does not halt the flow, but marks the affected output as pending re-verification so the trader can judge its currency'],
    ['Declared value below USD 2,000?', 'FR-REQ-03', 'B.4a', 'First of the two simplified-regime gates'],
    ['Product on the qualifying STR list?', 'FR-REQ-03', 'B.4a', 'Second gate. Both must pass; either failing routes to the full customs requirement set'],
    ['Proceed with this trade?', 'FR-SHP-01', 'B.4a', 'The trader’s commitment point. Declining returns to adjust the product, quantity or destination rather than creating a shipment'],
    ['All mandatory items obtained?', 'FR-REQ-04', 'B.4b', 'Controls the document-gathering loop; the shipment cannot advance to “documents ready” until this is satisfied'],
    ['Transport required? and Request accepted?', 'FR-TRN-03, FR-TRN-04', 'B.4b', 'The first determines whether the trader enters the matching subflow at all; the second handles the declined-request path, which returns the trader to provider selection'],
  ], { size: 19 }));
  c.push(CAP('Table B.7. Decision nodes and the requirements they realise.'));

  c.push(H4('Parallelism and iteration'));
  c.push(P('The fork after checklist assembly is a substantive modelling claim, not decoration. Cost estimation and border ranking share the trade intention as input but neither depends on the other’s output, so they are genuinely concurrent; the join means the trade plan is presented only when both have completed. This is the model-level justification for the parallel service calls that make the 3-second response target in NFR-PER-01 and NFR-PER-02 achievable.'));
  c.push(P('The document-gathering loop is the workflow’s principal iteration, and it is where the trader spends the most real-world time — often days, across multiple issuing authorities. Modelling it as a loop with a readiness recalculation on each pass is what makes FR-REQ-04 meaningful: the trader always knows how far from ready they are, and which item is blocking. Two further return paths exist but are drawn as terminations rather than as loops, to keep the diagrams readable: declining the plan at “Proceed with this trade?” returns the trader to adjust the intention, and a declined transport request returns them to provider selection.'));

  c.push(H4('Inputs, outputs and activities'));
  c.push(mkTable([2200, 7160], [
    ['Aspect', 'Detail'],
    ['Trigger', 'A trader decides to move a consignment across a border'],
    ['Inputs', 'Consignment details; regulatory rule set with verification dates; STR product list and threshold; duty, tax and fee schedules; exchange rate; border crossing register; transport listings'],
    ['Key activities', 'Resolve corridor and classification · load and check rules · determine simplified-regime eligibility · assemble checklist with citations · compute cost and rank crossings in parallel · create shipment · gather documents iteratively · match and engage transport · transition shipment status · subscribe to alerts'],
    ['Outputs', 'A trade plan; a shipment in the “in transit” state with an immutable planning snapshot; a completed document set; an engaged transport provider; an active alert subscription'],
    ['Terminal states', 'Successful: the trader travels to the recommended crossing document-ready. Unsuccessful: the corridor is unsupported, or the trader abandons or revises the intention'],
  ], { size: 19 }));
  c.push(CAP('Table B.8. Inputs, activities and outputs of the end-to-end workflow.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- B.5 TRACEABILITY ----------
  c.push(H3('B.5 Diagram-to-Requirement Traceability'));
  c.push(P('The table below records where each functional module of Section 4 is modelled. Nine of the eleven modules are represented in at least one diagram; the two that are not are identified beneath the table, with the reason. This is the check that the models describe the specified system rather than a different one.'));
  c.push(mkTable([2400, 1500, 1500, 1500, 1500, 960], [
    ['Module', 'B.1a/b\nUse case', 'B.2a/b\nClass', 'B.3\nSequence', 'B.4a/b\nActivity', 'Covered'],
    ['Account & Identity', 'Yes', 'Yes', '—', '—', 'Yes'],
    ['Trade Requirements', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Cost Estimation', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Border Information', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Transport Matching', 'Yes', 'Yes', '—', 'Yes', 'Yes'],
    ['Marketplace Discovery', 'Yes', 'Yes', '—', '—', 'Yes'],
    ['Shipment Tracking', 'Yes', 'Yes', '—', 'Yes', 'Yes'],
    ['Notifications & Alerts', 'Yes', 'Yes', '—', 'Yes', 'Yes'],
    ['Regulation Management', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Localisation', '—', '—', '—', '—', 'Cross-cutting'],
    ['Reporting & Analytics', '—', '—', '—', '—', 'Deferred to R4'],
  ], { size: 19 }));
  c.push(CAP('Table B.9. Coverage of the Section 4 modules across the four diagram types.'));
  c.push(P('Two modules are intentionally not modelled. Localisation is a cross-cutting presentation concern applying to every output rather than a distinct structure or flow; modelling it would add a language attribute to every diagram without clarifying anything. Reporting and Analytics consists entirely of Could-priority requirements scheduled for release R4, and is modelled once its scope is confirmed. Both omissions are recorded here rather than left silent, so that a reader can see they are decisions rather than oversights.'));

  c.push(H3('B.6 Diagram source files'));
  c.push(P('All seven diagrams were authored as PlantUML source and rendered to PNG. The source files accompany this document, so that any diagram can be amended and re-rendered without redrawing:'));
  c.push(mkTable([3200, 2400, 3760], [
    ['Source file', 'Figure', 'Diagram type'],
    ['B1a_use_case_trader.puml', 'B.1a', 'Use case (behavioural)'],
    ['B1b_use_case_supply.puml', 'B.1b', 'Use case (behavioural)'],
    ['B2a_class_core.puml', 'B.2a', 'Class (structural)'],
    ['B2b_class_fulfilment.puml', 'B.2b', 'Class (structural)'],
    ['B3_sequence.puml', 'B.3', 'Sequence (behavioural)'],
    ['B4a_activity_planning.puml', 'B.4a', 'Activity (behavioural)'],
    ['B4b_activity_fulfilment.puml', 'B.4b', 'Activity (behavioural)'],
  ], { size: 19 }));
  c.push(P('Each was rendered at 300 dpi, so the figures remain sharp when magnified on screen. Full-resolution PNG files are supplied alongside the source, for any diagram that warrants closer inspection than page size allows.', { after: 200 }));
};
