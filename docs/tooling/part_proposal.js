// FORMATIVE ASSIGNMENT — project proposal, written to the ALU template prompts.
const L = require('./lib_doc');
const { d, P, PR, H1, H2, H3, H4, BULLET, NUM, REF, mkTable, CAP, RULE, NOTE, QUOTE, ACCENT, W } = L;
const { Paragraph, TextRun, AlignmentType, PageBreak } = d;

module.exports = function proposal(c) {

  // ===== TITLE =====
  c.push(
    new Paragraph({ spacing: { before: 900, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'AFRICAN LEADERSHIP UNIVERSITY', size: 24, bold: true, color: ACCENT, characterSpacing: 30, font: 'Calibri' })] }),
    new Paragraph({ spacing: { after: 500 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'BSc (Hons) Software Engineering', size: 22, color: '595959', font: 'Calibri' })] }),
    new Paragraph({ spacing: { after: 300 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'FORMATIVE ASSIGNMENT', size: 40, bold: true, color: ACCENT, font: 'Calibri' })] }),
    new Paragraph({ spacing: { after: 100 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'BorderBridge', size: 56, bold: true, font: 'Calibri' })] }),
    new Paragraph({ spacing: { after: 400 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'A Consignment-Level Trade Planning Platform for Small-Scale Cross-Border Traders in the East African Community', size: 25, color: '333333', font: 'Calibri' })] }),
    RULE(),
  );

  c.push(mkTable([2600, 6760], [
    ['Field', 'Detail'],
    ['Student name', '[INSERT YOUR FULL NAME]'],
    ['Student email', '[INSERT YOUR EMAIL]'],
    ['Programme', 'BSc (Hons) Software Engineering'],
    ['ALU Mission (GCGO)', 'Regional Integration (primary); Infrastructure, Job Creation and Empowerment of Women (supporting)'],
    ['Software development model', 'Agile — Scrum, delivered on an incremental release roadmap'],
    ['Document', 'Project Proposal and Software Requirements Specification'],
    ['Version', '2.0'],
    ['Date', '[INSERT DATE — MM/DD/YYYY]'],
  ], { size: 21 }));

  c.push(new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'File naming convention: person_name[Assignment1]_[W4]_[MMDDYYYY]', size: 19, italics: true, color: '808080', font: 'Calibri' })] }));
  c.push(new Paragraph({ spacing: { before: 80 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Rename this file and complete the name and date fields above before submitting.', size: 19, italics: true, color: '808080', font: 'Calibri' })] }));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ===== PROPOSAL =====
  // ---- Mission ----
  c.push(H1('1. Description of the Concept of the Mission'));

  c.push(H2('1.1 The mission'));
  c.push(QUOTE('My mission is Regional Integration: to reduce the practical cost of crossing an African border for the smallest traders, so that the African Continental Free Trade Area becomes usable by the people it was designed to serve, and not only by firms large enough to employ a customs clearing agent.'));

  c.push(P('The African Leadership University (ALU) organises learning around missions rather than majors. Each student declares a real problem they intend to solve, anchored to one of ALU’s Global Challenges and Great Opportunities. ALU defines Regional Integration as fostering partnerships and the ideals of Pan-Africanism through cultural exchange, international movement and trade, towards an integrated continent with common values and a shared vision (ALU, 2026). BorderBridge is a direct instrument of that definition.'));

  c.push(H2('1.2 Relevance of the mission to Africa’s development'));
  c.push(P('Africa has chosen trade as its route to industrialisation. The AfCFTA could raise income by USD 450 billion and lift 30 million from poverty by 2035 (World Bank, 2020), and 61 per cent of intra-African exports are processed goods, the value addition commodities lack (UNCTAD, 2024). Yet informal traders, 74 per cent of them women, remain excluded (ECA, 2023). An agreement only large firms can navigate integrates a corporate tier, not a continent.'));

  c.push(H2('1.3 Why this is a software problem'));
  c.push(P('The rules that would benefit small traders already exist and are already published. The AfCFTA Phase I protocols on Trade in Goods, Trade in Services and Dispute Settlement are operational (tralac, 2026), and the East African Community Simplified Trade Regime exempts consignments valued under USD 2,000 from full customs declaration procedures. What does not exist is a way for a specific trader, holding a specific consignment, to find out what those rules mean for them before they travel. That is a computation and distribution problem, and it is tractable in software.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- Problem statement ----
  c.push(H1('2. Problem Statement'));

  c.push(H2('2.1 Background'));
  c.push(P('Consider a trader in Kigali with 200 kg of coffee to sell in Kampala. Her obstacle is rarely the tariff. It is that she cannot establish, before setting off, which documents she needs, what she will be charged, whether her consignment qualifies for simplified treatment, or which crossing to use. She may travel to a border and be turned back for a missing certificate. She may pay a charge she has no way to verify. Faced with unknowable requirements, the rational response is to route around the formal system entirely — which costs her legal protection and access to finance, costs the state revenue and data, and leaves informal cross-border trade invisible to the policy process meant to support it.'));
  c.push(P('This is not a shortage of law. It is a shortage of legible, consignment-specific answers. Losses to business and government from delays, complex documentation and unpredictable border procedures already exceed tariff costs, and the average cost of non-tariff measures in intra-ECOWAS trade has been put at 241 per cent of the tariff cost of trade (tralac, 2019). The average time to import between member states of SADC and COMESA has been reported at 38 days, against 12 days within the European Union (tralac, 2019).'));

  c.push(H2('2.2 The problem statement'));
  c.push(QUOTE('Small-scale and informal cross-border traders in the East African Community cannot determine, before they travel, which documents, duties, product-specific conditions and border procedures apply to a particular consignment on a particular route. Authoritative information exists but is fragmented across separate national systems, expressed as generic procedure rather than as an answer about a specific shipment, published in languages and formats that assume a desktop browser and a literate reader of English or French, and unaccompanied by any calculation of what the movement will actually cost. In the absence of a trustworthy pre-departure answer, traders depend on intermediaries, rumour or the discretion of individual officials, which produces avoidable cost, avoidable delay, exposure to arbitrary charges, and a persistent drift into informality. The instruments intended to make intra-African trade easier — the AfCFTA and the EAC Simplified Trade Regime — are therefore systematically under-used by the population they were designed to benefit.'));

  c.push(H2('2.3 The problem in WHO, WHAT, WHEN, WHERE, WHY and HOW'));
  c.push(mkTable([1200, 8160], [
    ['Question', 'Answer'],
    ['WHO', 'Small-scale and informal cross-border traders in the East African Community — typically moving consignments valued under USD 2,000, frequently trading agricultural or light consumer goods, and predominantly women, who account for the substantial majority of informal cross-border trade transactions (ECA, 2023). Secondary sufferers are independent transport operators with unfilled capacity, and customs officers who process incomplete declarations.'],
    ['WHAT', 'They cannot obtain a reliable, consignment-specific answer to a single question: what will this shipment require, and what will it cost, before I leave? The result is missing documents at the border, unbudgeted charges, rejected consignments, lost perishable stock, and avoidance of formal channels altogether.'],
    ['WHEN', 'At the planning stage — the hours or days before travelling, which is the only point at which the problem is still cheap to fix. Once the trader is standing at the border with an incomplete document set, every remedy is expensive. The problem recurs on every trip, and again whenever a rule, rate or product list changes.'],
    ['WHERE', 'At EAC land border crossings and in the trading towns that feed them. The pilot corridor is Rwanda–Uganda, principally Gatuna/Katuna and Kagitumba/Mirama Hills, chosen because both countries have recorded informal cross-border trade annually since 2014, which provides a measurement baseline.'],
    ['WHY', 'Because trade knowledge is organised around institutions rather than around shipments. Each customs authority publishes its own procedures for its own jurisdiction; a single cross-border movement touches at least two such systems. Regulatory agencies operate in silos, applying inconsistent standards and rejecting one another’s certifications (tralac, 2026). Nothing joins the two halves of a corridor into one answer, computes what the trader will pay, or delivers it to a low-cost phone in a language she reads.'],
    ['HOW', 'The consequences propagate: a trader who cannot predict requirements cannot budget, so she under-capitalises; she cannot prove which rule applies, so she cannot contest an arbitrary charge; she avoids the formal system, so she builds no transaction record and cannot access credit; and her trade goes unrecorded, so policy is designed without her. BorderBridge intervenes at the first link in that chain — the pre-departure answer.'],
  ], { size: 19 }));
  c.push(CAP('Table 1. The problem expressed against the six framing questions.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- Gap analysis ----
  c.push(H1('3. Existing Solutions and the Gap'));
  c.push(P('This section states honestly what already exists, because a proposal that ignores incumbents is not credible. Four categories of solution address adjacent parts of this problem. None of them closes it, and the reason each falls short is specific rather than general.'));

  c.push(H2('3.1 Trade information services for traders'));
  c.push(PR([['Sauti East Africa ', { b: true }], ['is the closest existing solution and a genuinely capable one. Traders reach it by USSD, SMS or WhatsApp from a feature phone with no internet connection, and it returns verified trade procedures, market prices, official tax rates and exchange rates, with a facility for reporting bribery and harassment. It operates in five languages including Kinyarwanda and Kiswahili, has served over 27,000 traders and more than 85,000 information requests, and tracks 110 product prices across 82 markets in six EAC countries (Sauti East Africa, n.d.-a).']]));
  c.push(P('Sauti proves the channel works and that demand is real. Its limitation is architectural rather than a failure of execution: it is an information retrieval service. A trader asks a question and receives a published fact. It does not take the parameters of one shipment and compute an answer specific to it — it does not assemble a document checklist for that consignment, calculate its landed cost, determine whether it qualifies for the Simplified Trade Regime, or persist it as a trackable shipment.'));

  c.push(H2('3.2 National and regional trade information portals'));
  c.push(P('The Rwanda Trade Portal and the Uganda Trade Portal, developed with TradeMark Africa, UNCTAD and ITC support, publish national trade procedures step by step in fulfilment of Article 1 of the WTO Trade Facilitation Agreement. For each step they state where to go, whom to see, which documents to bring, which forms to complete, what it costs, which law justifies the step, and where to complain (TradeMark Africa, n.d.). This is high-quality, authoritative content, and BorderBridge depends on such sources rather than competing with them.'));
  c.push(P('Three properties nonetheless keep them out of reach of the trader described in Section 2:'));
  c.push(BULLET('They are organised by country, not by corridor. A single Kigali-to-Kampala movement touches two portals, and neither reconciles with the other or presents a combined answer.'));
  c.push(BULLET('They describe generic procedure, not a specific consignment. The portal explains how importing works; it does not tell this trader what her 200 kg of coffee requires, or compute what it will cost.'));
  c.push(BULLET('They assume a desktop browser and a continuous internet connection, which is the wrong delivery assumption for a user on an entry-level handset and a metered 2G connection.'));

  c.push(H2('3.3 Digital freight and logistics platforms'));
  c.push(P('Lori Systems, Kobo360 and Sendy have built substantial cargo-matching businesses, using algorithmic matching, GPS tracking and mobile-money payment to connect cargo owners with vetted trucks. Lori alone has more than 20,000 trucks connected and coordinates cargo across twelve countries, and a large share of key commodities moving between Kenya and Uganda runs through it (Lori Systems, n.d.).'));
  c.push(P('These platforms solve transport matching well, but for a different customer. They are built around truckload-scale commodity cargo with a shipper who already knows the regulatory position. They do not serve a trader with 200 kg and an unanswered compliance question, and they offer no regulatory guidance at all.'));

  c.push(H2('3.4 Customs and single-window systems'));
  c.push(P('National customs platforms and electronic single windows are the systems of record for declarations. They are designed for licensed clearing agents and registered importers submitting formal entries, not for a trader planning a trip. They begin where BorderBridge ends: at the point of declaration, after the trader already knows what to declare.'));

  c.push(H2('3.5 The gap, stated precisely'));
  c.push(mkTable([2100, 1500, 1500, 1500, 1400, 1360], [
    ['Capability', 'Sauti\nEast Africa', 'National\ntrade portals', 'Freight\nplatforms', 'Customs\nsystems', 'Border-\nBridge'],
    ['Authoritative procedure content', 'Yes', 'Yes', 'No', 'Yes', 'Yes'],
    ['Reaches low-cost phones offline', 'Yes', 'No', 'Partly', 'No', 'Yes'],
    ['Local-language delivery', 'Yes', 'Partly', 'No', 'No', 'Yes'],
    ['Answer specific to one consignment', 'No', 'No', 'No', 'No', 'Yes'],
    ['Single answer spanning both sides of a corridor', 'Partly', 'No', 'Yes', 'No', 'Yes'],
    ['Computed landed cost with itemised duties and fees', 'No', 'No', 'Partly', 'No', 'Yes'],
    ['Automatic simplified-regime eligibility test', 'No', 'No', 'No', 'No', 'Yes'],
    ['Transport matching for sub-tonne consignments', 'No', 'No', 'No', 'No', 'Yes'],
    ['Persistent, trackable shipment record', 'No', 'No', 'Yes', 'Partly', 'Yes'],
    ['Source citation and verification date on every rule', 'Partly', 'Yes', 'No', 'Yes', 'Yes'],
  ], { size: 19 }));
  c.push(CAP('Table 2. Capability comparison against existing solutions.'));

  c.push(H4('What is unique in this solution'));
  c.push(P('The gap is not a missing information source. It is the absence of a computational layer between published rules and an individual shipment. Every existing solution either publishes rules generically or moves cargo; none takes four parameters — origin, destination, product and quantity — and returns a single derived plan.'));
  c.push(P('BorderBridge is therefore differentiated on four specific points:'));
  c.push(NUM('Consignment-level computation rather than information retrieval. The unit of output is not an article of procedure but a trade plan for one shipment: a document checklist, an itemised landed cost, and a recommended crossing, all derived from the consignment’s own parameters.'));
  c.push(NUM('Corridor-spanning answers. Rules from both the origin and the destination jurisdiction are resolved into one checklist, which is precisely the reconciliation no national portal performs.'));
  c.push(NUM('Automatic simplified-regime determination. The system tests the consignment against the USD 2,000 threshold and the qualifying product list and, where it qualifies, substitutes the reduced requirement set and states the basis of eligibility with a citation. Studies repeatedly find that traders do not use the Simplified Trade Regime because they do not know it applies to them; this converts a published entitlement into an automatic result.'));
  c.push(NUM('Planning through to execution in one record. The plan becomes a trackable shipment that connects to transport and to counterparties in the destination market, so the trader is not handed off between four disconnected tools.'));
  c.push(NOTE('A note on positioning. Sauti East Africa demonstrates that this user can be reached and that the demand exists — that is an argument for the concept, not against it. BorderBridge is complementary rather than adversarial: it consumes the same authoritative sources as the national trade portals, and the sensible long-term posture is integration with these services rather than duplication of them.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- Development model ----
  c.push(H1('4. Software Development Model'));
  c.push(P('BorderBridge will be developed using Agile (Scrum) on an incremental release roadmap. The choice follows from this project’s properties: the dominant risk is building the wrong thing, and a two-week sprint bounds how much effort goes into a wrong assumption before a trader corrects it; requirements cannot be specified before field research with low-literacy, multilingual users; and the regulatory domain is volatile (tralac, 2026), so change enters as backlog work rather than as a defect in the plan. Waterfall assumes stable requirements and would surface validation errors only at testing; Spiral’s overhead is disproportionate to a single-developer project, though its risk discipline is retained. In practice, a backlog of trader-facing user stories, each traced to an SRS requirement identifier, is grouped into four releases; each two-week sprint runs planning under a single sprint goal, a written daily standup log, and execution to a definition of done that includes updated SRS text, UML models and passing tests, closing with a review that demonstrates the increment to real traders and a retrospective. Risk is re-assessed at each release boundary, regulatory accuracy first, and the backlog is refined continuously.'));

  c.push(H2('4.1 Sprint schedule mapped to course deliverables'));
  c.push(mkTable([1300, 1700, 3300, 3060], [
    ['Sprint', 'Release', 'Focus', 'Deliverable produced'],
    ['0', '—', 'Field research, stakeholder interviews, backlog creation, data-source feasibility', 'Project proposal'],
    ['1–2', 'R1 Core', 'Requirements elicitation and specification; registration; checklist engine', 'SRS Sections 1–4'],
    ['3–4', 'R1 Core', 'Cost estimation; currency conversion; architecture and data model', 'UML models (Appendix B)'],
    ['5–6', 'R2 Corridor', 'Border information, status reporting, crossing recommendation, shipment tracking', 'Software design document'],
    ['7–8', 'R3 Market', 'Transport matching; buyer and supplier discovery; multilingual support', 'Test plan and execution'],
    ['9–10', 'R4 Hardening\nand reporting', 'Usability testing with traders, accessibility, offline behaviour, performance tuning, and administrative reporting', 'Working prototype; UAT report'],
  ], { size: 19 }));
  c.push(CAP('Table 3. Sprint plan mapped to releases and course deliverables.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- Hypothesis ----
  c.push(H1('5. Hypothesis of the Solution'));

  c.push(P('If small-scale traders are given a single authoritative, mobile-accessible answer — in a language they read — to what a specific consignment on a specific route will require and cost, then their pre-departure preparation should measurably improve, their unplanned costs and delays at the border should fall, and their use of formal and simplified trade channels should rise. The claim is falsifiable: it assumes the binding constraint is the absence of consignment-specific information rather than compliance cost, working capital or deliberate evasion, and field research in Sprint 0 tests that before any code is written. Once deployed, the system is anticipated to cut missing-document incidents by at least 30 per cent, hold cost estimates within 15 per cent of actual outcomes, and raise awareness of the Simplified Trade Regime by 40 percentage points among users — converting existing but invisible trade rights into usable ones.'));

  c.push(mkTable([700, 3400, 2900, 2360], [
    ['ID', 'Anticipated outcome', 'Measure', 'Success threshold'],
    ['H1', 'Traders using BorderBridge arrive at the border with a more complete document set than those who do not', 'Missing-document incidents at first presentation, self-reported and spot-checked', '≥ 30% reduction against baseline'],
    ['H2', 'The cost estimate is close enough to actual cost to be decision-useful', 'Absolute percentage error between estimated and actual landed cost', 'Median error ≤ 15%'],
    ['H3', 'Crowdsourced border status is timely and accurate enough to inform crossing choice', 'Agreement with observed conditions; report age at point of use', '≥ 80% agreement; median age under 6 hours'],
    ['H4', 'Awareness of the EAC Simplified Trade Regime rises among users', 'Pre- and post-use survey on STR awareness and the USD 2,000 threshold', '≥ 40 percentage-point increase'],
    ['H5', 'The interface is usable unassisted by low-literacy and non-English-speaking traders', 'Task completion rate in unassisted think-aloud testing', '≥ 80% completion of the core task'],
    ['H6', 'Traders shift trips from informal to formal or simplified channels', 'Proportion of trips declared under STR or full procedure, before and after', 'Measurable increase on the pilot corridor'],
  ], { size: 19 }));
  c.push(CAP('Table 4. Anticipated outcomes as falsifiable predictions.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- References ----
  c.push(H1('6. References'));
  c.push(P('Formatted in APA 7th edition.', { italics: true, after: 200 }));
  c.push(REF('African Leadership University. (2026). Mission-driven majors. https://www.alueducation.com/missions-not-majors/'));
  c.push(REF('Economic Commission for Africa. (2023, November 16). Rethinking informal cross-border trade in Africa. United Nations Economic Commission for Africa. https://www.uneca.org/stories/rethinking-informal-cross-border-trade-in-africa'));
  c.push(REF('GSMA. (2024). The mobile economy Sub-Saharan Africa 2024. GSMA Intelligence. https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-economy/'));
  c.push(REF('Lori Systems. (n.d.). Transforming African logistics through technology. https://lorisystems.com/'));
  c.push(REF('Sauti East Africa. (n.d.-a). Sauti trade and market information platform. https://www.sautiafrica.org/services-products/trade-market-info-platform/'));
  c.push(REF('Sauti East Africa. (n.d.-b). The Simplified Trade Regime in the EAC and challenges to cross-border traders. https://www.sautiafrica.org/the-simplified-trade-regime-in-the-eac-and-challenges-to-cross-border-traders/'));
  c.push(REF('TradeMark Africa. (n.d.). Rwanda country programme: Trade information portal. https://trademarkafrica.com/rwanda/'));
  c.push(REF('tralac. (2019, March). The intra-Africa NTB dilemma: The challenges facing the AfCFTA approach. Trade Law Centre. https://www.tralac.org/'));
  c.push(REF('tralac. (2026, March 3). Seven non-tariff trade barriers in Africa and practical solutions to overcome them. Trade Law Centre. https://www.tralac.org/blog/article/17039-seven-non-tariff-trade-barriers-in-africa-and-practical-solutions-to-overcome-them.html'));
  c.push(REF('United Nations Conference on Trade and Development. (2024). Economic development in Africa report 2024: Unlocking Africa’s trade potential — Boosting regional markets and reducing risks. UNCTAD. https://unctad.org/publication/economic-development-africa-report-2024'));
  c.push(REF('World Bank. (2020). The African Continental Free Trade Area: Economic and distributional effects. World Bank Group. https://www.worldbank.org/en/topic/trade/publication/the-african-continental-free-trade-area'));

  c.push(new Paragraph({ children: [new PageBreak()] }));
};
