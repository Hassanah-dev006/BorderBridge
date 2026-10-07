// SRS Section 4 — Requirement Specification: one summary paragraph and one prioritised table.
const L = require('./lib_doc');
const { d, P, H1, mkTable, CAP } = L;
const { Paragraph, PageBreak } = d;

module.exports = function srs4(c) {

  c.push(H1('4. Requirement Specification'));

  c.push(P('Requirements were elicited from the needs of six user classes — traders, transport providers, buyers and suppliers, customs officers, administrators and the automated scheduler — and are specified below as twenty functional requirements across ten modules: account and identity, trade requirements, cost estimation, border information, transport matching, marketplace discovery, shipment tracking, notifications, regulation management and localisation. Each carries a permanent identifier, a MoSCoW priority and a primary actor, and is traced to the UML models in Section 6 and to the test specification. Seventeen are Must-priority and together constitute the minimum viable version 1.0; the remaining three are scheduled into releases R2 and R3. The UML models in Section 6 depict the wider product backlog as well as these twenty, and identify backlog items deferred beyond this release using the same identifier scheme. Quality attributes are specified separately in Section 5.'));

  c.push(mkTable([1180, 4520, 1600, 950, 1110], [
    ['ID', 'The system shall…', 'Primary actor', 'Priority', 'Release'],

    ['FR-ACC-01', 'Allow a new user to register using a mobile phone number as the primary identifier, selecting the role Trader, Transport Provider or Buyer/Supplier', 'Trader, Provider, Buyer', 'Must', 'R1'],
    ['FR-ACC-02', 'Verify ownership of the registered phone number by one-time SMS code before the account may be used', 'Trader, Provider, Buyer', 'Must', 'R1'],

    ['FR-REQ-01', 'Allow a trader to specify a trade intention: origin country, destination country, product, and quantity or declared value', 'Trader', 'Must', 'R1'],
    ['FR-REQ-02', 'Generate a document checklist for the stated intention, distinguishing mandatory from conditional items, each with issuing authority, source citation and last-verified date', 'Trader', 'Must', 'R1'],
    ['FR-REQ-03', 'Determine whether the consignment qualifies for a simplified trade regime and present the reduced requirement set with the basis of eligibility', 'Trader', 'Must', 'R1'],
    ['FR-REQ-05', 'Export a checklist as a printable PDF and as a plain-text summary in the trader’s selected language', 'Trader', 'Should', 'R1'],

    ['FR-CST-01', 'Produce an itemised estimate of landed cost — product value, transport, duties, taxes and fees — with a confidence range', 'Trader', 'Must', 'R1'],
    ['FR-CST-02', 'Convert monetary values between origin, destination and preferred currencies, recording the rate applied and its timestamp', 'Trader', 'Must', 'R1'],
    ['FR-CST-03', 'Explain, for each cost line, the rule and rate from which it was derived', 'Trader', 'Must', 'R1'],
    ['FR-CST-04', 'State on every estimate that it is guidance and not a binding determination by a customs authority', 'Trader', 'Must', 'R1'],

    ['FR-BRD-01', 'Recommend the most suitable border crossing for a stated intention, stating the ranking rationale', 'Trader', 'Must', 'R2'],
    ['FR-BRD-03', 'Allow a user at or near a crossing to report current conditions and estimated waiting time', 'Trader, Provider', 'Must', 'R2'],
    ['FR-BRD-05', 'Decay and expire stale community reports so that they are never presented as current', 'Scheduler', 'Must', 'R2'],

    ['FR-SHP-01', 'Allow a trader to convert a trade plan into a trackable shipment with an immutable planning snapshot', 'Trader', 'Must', 'R2'],

    ['FR-NOT-02', 'Notify subscribed users when a regulation, duty rate or document requirement affecting them is published or amended', 'Scheduler', 'Must', 'R2'],

    ['FR-TRN-02', 'Present transport providers whose offering fits a stated shipment, ranked by rating, verification status and cost', 'Trader', 'Must', 'R3'],

    ['FR-MKT-02', 'Surface potential buyers or suppliers in the destination market relevant to a stated intention', 'Trader', 'Should', 'R3'],

    ['FR-ADM-01', 'Allow an administrator to create, amend and retire regulatory rules, stored as new versions rather than overwritten', 'Administrator', 'Must', 'R1'],
    ['FR-ADM-03', 'Require every rule to carry its governing instrument and last-verified date, rejecting any rule without a citation', 'Administrator', 'Must', 'R1'],

    ['FR-LOC-01', 'Allow a user to select English, French, Kiswahili or Kinyarwanda and persist the choice across sessions', 'All users', 'Should', 'R3'],
  ], { size: 18 }));
  c.push(CAP('Table 4.1. Functional requirements — 20 requirements across 10 modules (17 Must, 3 Should).'));

  c.push(new Paragraph({ children: [new PageBreak()] }));
};
