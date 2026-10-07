// SRS Section 5 — Other Nonfunctional Requirements, in the ALU template's four subsections.
const L = require('./lib_doc');
const { d, P, PR, H1, H2, H3, H4, BULLET, mkTable, CAP, NOTE, NFRTable } = L;
const { Paragraph, PageBreak } = d;

module.exports = function srs5(c) {

  c.push(H1('5. Other Nonfunctional Requirements'));
  c.push(P('This section specifies the quality attributes the system must exhibit — not what it does, but how well it must do it. Fifty-eight non-functional requirements are specified. Each carries a permanent identifier of the form NFR-XXX-nn and an explicit verification method, so that every one is testable rather than aspirational.'));
  c.push(NOTE('Non-functional requirements are unusually decisive for this system. The target user typically holds an entry-level device on an intermittent, metered 2G or 3G connection, may have limited literacy, may not read English, and will act on the system’s output at a border where being wrong carries a real cost. Performance, offline behaviour, accuracy and accessibility are therefore not refinements to be added late — they are conditions of the product working at all.'));

  c.push(P('The requirements were derived against the quality characteristics of ISO/IEC 25010 and are presented here under the four headings of this document’s template. The mapping is as follows, so that no requirement is lost and none is filed arbitrarily:'));
  c.push(mkTable([2300, 3200, 1400, 2460], [
    ['Template subsection', 'ISO/IEC 25010 characteristics included', 'Count', 'Identifier prefixes'],
    ['5.1 Performance Requirements', 'Performance efficiency; capacity and scalability', '10', 'NFR-PER, NFR-SCA'],
    ['5.2 Security Requirements', 'Security; privacy and data protection', '14', 'NFR-SEC, NFR-PRI'],
    ['5.3 Software Quality Attributes', 'Reliability; usability and accessibility; compatibility and portability; maintainability', '24', 'NFR-REL, NFR-USA, NFR-CMP, NFR-MNT'],
    ['5.4 Business Rules', 'Accuracy and data integrity; legal and regulatory compliance', '10', 'NFR-ACC, NFR-LEG'],
    ['Total', '', '58', ''],
  ], { size: 19 }));
  c.push(CAP('Table 5.1. Mapping of quality characteristics to the template’s subsections.'));

  // ---------- 5.1 PERFORMANCE ----------
  c.push(H2('5.1 Performance Requirements'));
  c.push(P('Performance is a usability requirement in this context rather than a matter of polish. A trader on a metered connection pays for every kilobyte, and a slow response on a 2G link is functionally equivalent to no response at all.'));

  c.push(H3('5.1.1 Response time and efficiency'));
  c.push(NFRTable([
    ['NFR-PER-01', 'The system shall return a generated document checklist within 3 seconds at the 95th percentile, measured server-side, for a corridor whose regulatory content is loaded.', 'Load testing with response-time percentile measurement'],
    ['NFR-PER-02', 'The system shall return a landed cost estimate within 3 seconds at the 95th percentile, including currency conversion using a cached exchange rate.', 'Load testing'],
    ['NFR-PER-03', 'The first contentful paint of the trader interface shall occur within 5 seconds on a simulated 3G connection on a mid-range Android device.', 'Lighthouse audit under network throttling on a reference device'],
    ['NFR-PER-04', 'The initial application payload shall not exceed 500 KB compressed, and a typical checklist interaction shall not exceed 100 KB of data transfer.', 'Bundle analysis and network trace inspection'],
    ['NFR-PER-05', 'The system shall support at least 500 concurrent active users with no more than 20% degradation of the response times in NFR-PER-01 and NFR-PER-02.', 'Sustained concurrency load test'],
    ['NFR-PER-06', 'Database queries supporting checklist generation and cost estimation shall complete within 200 ms at the 95th percentile.', 'Query profiling under representative data volume'],
  ]));

  c.push(H3('5.1.2 Capacity and scalability'));
  c.push(NFRTable([
    ['NFR-SCA-01', 'The system shall support the addition of a new corridor through configuration and regulatory content entry alone, without code modification.', 'Addition of a second corridor as a test case'],
    ['NFR-SCA-02', 'Application services shall be stateless, so that capacity may be increased by horizontal scaling.', 'Architecture review and multi-instance load test'],
    ['NFR-SCA-03', 'The system shall accommodate growth to 50,000 registered users and 10,000 shipments per month without architectural redesign.', 'Capacity modelling and volume testing'],
    ['NFR-SCA-04', 'The addition of a further interface language shall require only the provision of translation resources, not code modification.', 'Addition of a fifth language as a test case'],
  ]));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- 5.2 SECURITY ----------
  c.push(H2('5.2 Security Requirements'));
  c.push(P('The system holds national identification numbers and, by implication, information about how individuals trade. Two distinct obligations follow: conventional security against attackers, and a specific obligation not to create a record that could be turned against the user. The second is unusual and is treated as a first-class requirement rather than a policy note.'));

  c.push(H3('5.2.1 Authentication, authorisation and protection'));
  c.push(NFRTable([
    ['NFR-SEC-01', 'All data in transit shall be encrypted using TLS 1.2 or higher; plaintext HTTP shall be refused.', 'TLS configuration scan and penetration testing'],
    ['NFR-SEC-02', 'Credentials shall be stored using a memory-hard adaptive hashing algorithm (bcrypt, scrypt or Argon2) with a per-user salt. Plaintext or reversibly encrypted credentials are prohibited.', 'Code review and database inspection'],
    ['NFR-SEC-03', 'National identification and passport numbers shall be encrypted at rest and shall never be returned in full by any API response or written to any log.', 'Code review, log inspection and API response audit'],
    ['NFR-SEC-04', 'The system shall enforce role-based access control. Every administrative endpoint shall verify role membership server-side; client-side restriction alone is insufficient.', 'Authorisation testing including privilege-escalation attempts'],
    ['NFR-SEC-05', 'Authentication endpoints shall be rate-limited, with progressive lockout after five consecutive failed attempts from the same account or source.', 'Brute-force simulation'],
    ['NFR-SEC-06', 'All input shall be validated server-side and parameterised at the persistence layer; output shall be encoded on rendering, so as to prevent injection and cross-site scripting.', 'Static analysis and OWASP Top 10 penetration testing'],
    ['NFR-SEC-07', 'All administrative actions on regulatory content, account verification and moderation shall be recorded in an append-only audit log capturing actor, action, target, timestamp and reason.', 'Audit log completeness review'],
    ['NFR-SEC-08', 'Sessions shall expire after 30 days of inactivity, and all sessions shall be invalidated on credential change.', 'Session lifecycle testing'],
  ]));

  c.push(H3('5.2.2 Privacy and data protection'));
  c.push(NFRTable([
    ['NFR-PRI-01', 'The system shall collect only personal data necessary for a stated function, and shall state at the point of collection why each field is required.', 'Data inventory review against processing purposes'],
    ['NFR-PRI-02', 'The system shall comply with Rwanda Law No. 058/2021 relating to the protection of personal data and privacy, and with equivalent obligations in each jurisdiction of operation.', 'Legal compliance review'],
    ['NFR-PRI-03', 'A user shall be able to export all personal data held about them, and to request deletion of their account and personal data, subject to lawful retention obligations.', 'Functional testing of export and deletion paths'],
    ['NFR-PRI-04', 'Personal contact details shall not be disclosed to another user without the explicit consent of the data subject.', 'Access-control and data-flow review'],
    ['NFR-PRI-05', 'Data exported for research shall be aggregated, shall suppress any group smaller than the configured minimum, and shall be tested for re-identification risk before release.', 'Re-identification risk assessment'],
    ['NFR-PRI-06', 'The system shall not record, and shall not be capable of reporting, individually attributable information about undeclared or informal trade activity to any enforcement authority.', 'Data model review and threat modelling against user harm'],
  ]));
  c.push(NOTE('NFR-PRI-06 is the requirement that makes the product usable by its intended population. Traders will not describe how they currently trade — or use a tool that observes it — if doing so creates evidence against them. It is expressed as a constraint on the data model, not as a promise in a privacy policy, because only the former is verifiable.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- 5.3 SOFTWARE QUALITY ATTRIBUTES ----------
  c.push(H2('5.3 Software Quality Attributes'));
  c.push(P('This subsection covers reliability, usability, compatibility and maintainability — the attributes that determine whether the system remains usable in the field and correctable over time.'));

  c.push(H3('5.3.1 Reliability and availability'));
  c.push(NFRTable([
    ['NFR-REL-01', 'The system shall achieve at least 99.5% monthly availability, excluding scheduled maintenance announced at least 48 hours in advance.', 'Uptime monitoring and monthly availability reporting'],
    ['NFR-REL-02', 'The system shall remain usable without network connectivity for previously retrieved content: cached checklists, cost estimates, shipment records and border details shall be readable offline.', 'Offline functional testing with the network disabled'],
    ['NFR-REL-03', 'Actions taken offline shall be queued locally and synchronised automatically when connectivity is restored, without data loss and without duplicate submission.', 'Interrupted-connectivity test scenarios with conflict cases'],
    ['NFR-REL-04', 'Failure of any external data source shall not render the system unavailable. The system shall fall back to the most recent cached value and shall display its age to the user.', 'Fault injection on each external adapter'],
    ['NFR-REL-05', 'The system shall recover from an unplanned outage within 4 hours (RTO) with a maximum data loss of 15 minutes (RPO).', 'Documented and rehearsed disaster recovery test'],
    ['NFR-REL-06', 'Transactional data shall be backed up daily, with backups retained for 30 days and restoration verified monthly.', 'Backup log review and restoration drill'],
  ]));

  c.push(H3('5.3.2 Usability and accessibility'));
  c.push(NFRTable([
    ['NFR-USA-01', 'A first-time trader shall be able to complete the core task — from registration to a generated checklist — without external assistance in no more than 10 minutes.', 'Moderated usability testing with representative users'],
    ['NFR-USA-02', 'At least 80% of participants in unassisted usability testing, including low-literacy and non-English-speaking participants, shall complete the core checklist task successfully.', 'Task-based usability testing with completion-rate measurement'],
    ['NFR-USA-03', 'Trader-facing text shall be written at a reading level no higher than that appropriate to a 12-year-old reader in each supported language, and shall avoid untranslated legal terminology without explanation.', 'Readability assessment and native-speaker review'],
    ['NFR-USA-04', 'The interface shall conform to WCAG 2.2 Level AA, including a minimum contrast ratio of 4.5:1 for body text and touch targets of at least 44 by 44 CSS pixels.', 'Automated accessibility scan plus manual audit'],
    ['NFR-USA-05', 'Every checklist item, cost line and border status shall be accompanied by an icon or text indicator that does not rely on colour alone to convey meaning.', 'Design review and greyscale rendering check'],
    ['NFR-USA-06', 'All error messages shall state what went wrong and what the user should do next, in the user’s selected language, without exposing technical detail.', 'Error-path review across all failure modes'],
    ['NFR-USA-07', 'The core checklist and cost-estimate functions shall be obtainable through a USSD or SMS fallback for users without a data connection or a smartphone.', 'End-to-end testing of the fallback channel'],
  ]));

  c.push(H3('5.3.3 Compatibility and portability'));
  c.push(NFRTable([
    ['NFR-CMP-01', 'The trader interface shall function correctly on Android 8.0 and later, iOS 14 and later, and on the current and one prior major version of Chrome, Firefox, Safari and Edge.', 'Cross-browser and cross-device test matrix'],
    ['NFR-CMP-02', 'The interface shall render and remain fully operable at viewport widths from 320 px to 1920 px.', 'Responsive design testing at defined breakpoints'],
    ['NFR-CMP-03', 'The application shall be installable as a Progressive Web App with a service worker providing offline capability, and shall not require distribution through an app store.', 'PWA installability audit'],
    ['NFR-CMP-04', 'The system shall be deployable to any container-orchestration platform without modification to application code, with all environment-specific configuration externalised.', 'Deployment to a second, independent environment'],
    ['NFR-CMP-05', 'External data sources shall be accessed only through adapter interfaces, so that a source may be replaced without change to domain logic.', 'Architecture review and dependency analysis'],
  ]));

  c.push(H3('5.3.4 Maintainability'));
  c.push(NFRTable([
    ['NFR-MNT-01', 'Automated test coverage of domain logic — the requirements engine, cost engine and matching engine — shall be at least 80% of statements.', 'Coverage report generated in the continuous integration pipeline'],
    ['NFR-MNT-02', 'All code shall pass the agreed linting and formatting standard, enforced automatically before merge.', 'Continuous integration gate'],
    ['NFR-MNT-03', 'Regulatory rules shall be stored as data and shall be modifiable by a trained non-developer administrator through the administrative interface.', 'Administrative task walkthrough with a non-developer'],
    ['NFR-MNT-04', 'All public API endpoints shall be documented in an OpenAPI specification kept current with the implementation.', 'Specification-to-implementation conformance check'],
    ['NFR-MNT-05', 'The system shall emit structured, correlatable logs at appropriate severity levels, excluding all personal data.', 'Log review and privacy inspection'],
    ['NFR-MNT-06', 'A developer new to the project shall be able to build and run the system locally from documented instructions within 2 hours.', 'Onboarding trial with an independent developer'],
  ]));

  c.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- 5.4 BUSINESS RULES ----------
  c.push(H2('5.4 Business Rules'));
  c.push(P('Business rules are the operating policies that constrain the system regardless of how it is implemented. For BorderBridge they fall into two groups: rules governing the accuracy and provenance of the advice the system gives, and rules governing the legal position it occupies. Both exist because the system advises people who face real consequences at a border, and both are stated as verifiable requirements rather than as intentions.'));

  c.push(H3('5.4.1 Accuracy and data integrity'));
  c.push(NFRTable([
    ['NFR-ACC-01', 'Every regulatory statement presented to a trader shall display its source citation and its last-verified date.', 'Interface audit across all rule-derived output'],
    ['NFR-ACC-02', 'Content derived from a rule whose verification date exceeds the configured review interval shall be visibly marked as pending re-verification.', 'Functional testing with artificially aged rule data'],
    ['NFR-ACC-03', 'Exchange rates shall be no more than 24 hours old when applied; where a rate is older, the system shall display the rate’s age alongside the converted amount.', 'Integration testing of the exchange-rate adapter'],
    ['NFR-ACC-04', 'Every cost estimate shall be accompanied by a non-dismissible statement that it is guidance and not a binding determination by a customs authority.', 'Interface audit'],
    ['NFR-ACC-05', 'Regulatory content shall be versioned. No historical version shall be overwritten, and it shall be possible to reconstruct the exact rule set applied to any historical shipment.', 'Data model review and historical reconstruction test'],
    ['NFR-ACC-06', 'The median absolute percentage error of landed cost estimates against recorded actuals shall not exceed 15% on the pilot corridor.', 'Statistical analysis of variance records under FR-RPT-02'],
  ]));

  c.push(H3('5.4.2 Legal and regulatory compliance'));
  c.push(NFRTable([
    ['NFR-LEG-01', 'The system shall present terms of use and a privacy notice, in every supported language, and shall record the user’s acceptance with a timestamp and version reference.', 'Functional testing and record inspection'],
    ['NFR-LEG-02', 'The system shall not represent itself as a licensed customs clearing agent, and shall not purport to issue binding determinations on classification, valuation or duty liability.', 'Content and legal review of all trader-facing output'],
    ['NFR-LEG-03', 'Where regulatory content is reproduced from an official source, attribution shall be given and reproduction shall remain within the terms of use of that source.', 'Source licensing review'],
    ['NFR-LEG-04', 'The system shall provide a documented channel through which a user may report inaccurate regulatory content, and shall respond to such reports within 5 working days.', 'Process audit and response-time measurement'],
  ]));

  c.push(H3('5.4.3 Operating policies stated as business rules'));
  c.push(P('The following policies are enforced by the requirements above and are recorded here in plain terms, because they govern the product’s conduct rather than its implementation.'));
  c.push(mkTable([700, 4200, 4460], [
    ['#', 'Business rule', 'Enforced by'],
    ['BR-01', 'No regulatory statement may be shown to a trader without its source and the date it was last verified.', 'NFR-ACC-01, FR-ADM-03'],
    ['BR-02', 'A rule that has not been verified within the review interval must be visibly flagged, not silently served.', 'NFR-ACC-02, FR-ADM-04'],
    ['BR-03', 'A cost estimate is guidance. The system never presents it as a determination by a customs authority.', 'NFR-ACC-04, NFR-LEG-02, FR-CST-04'],
    ['BR-04', 'Regulatory history is immutable. Any rule applied to a past shipment must remain reconstructable.', 'NFR-ACC-05, FR-ADM-01'],
    ['BR-05', 'A regulatory change takes effect for traders only after an explicit, audited publication step.', 'FR-ADM-02, NFR-SEC-07'],
    ['BR-06', 'A service provider’s listing is withheld from search until the account has been verified.', 'FR-ACC-06, FR-TRN-01, FR-MKT-01'],
    ['BR-07', 'Consignments below the simplified-regime threshold whose product qualifies must be offered the reduced requirement set, with the basis of eligibility stated.', 'FR-REQ-03'],
    ['BR-08', 'A user’s personal contact details are released to another user only on that user’s explicit consent.', 'NFR-PRI-04, FR-MKT-03'],
    ['BR-09', 'The platform must never become an instrument of enforcement against the traders it serves.', 'NFR-PRI-06, C7'],
    ['BR-10', 'Where an external data source fails, the system degrades to cached data with its age disclosed; it does not fail silently and does not present stale data as current.', 'NFR-REL-04, NFR-ACC-03'],
  ], { size: 19 }));
  c.push(CAP('Table 5.2. Operating policies and the requirements that enforce them.'));

  // ---------- 5.5 TRACEABILITY ----------
  c.push(H2('5.5 Traceability of Non-Functional Requirements'));
  c.push(P('Each group traces to the product objectives of Section 1.4.4 and to the constraints and assumptions of Sections 2.5 and 2.7, so that quality attributes are justified rather than asserted.'));
  c.push(mkTable([2000, 3600, 3760], [
    ['NFR group', 'Traces to objective', 'Traces to constraint, assumption or risk'],
    ['5.1.1 Performance', 'O5 — usable by the target user', 'C5 payload budget; low bandwidth and entry-level devices'],
    ['5.1.2 Scalability', 'Continental extension beyond the pilot corridor', 'C10 fixed language set for v1.0'],
    ['5.2.1 Security', 'All — trust is a precondition of use', 'Compromise of trader identity data'],
    ['5.2.2 Privacy', 'O3 — willingness to engage with formal channels', 'C7 no enforcement-usable record; A3 trust'],
    ['5.3.1 Reliability', 'O1, O4 — dependable preparation and crossing choice', 'C4 offline-first; A5 intermittent connectivity'],
    ['5.3.2 Usability', 'O5 — unassisted use by low-literacy, multilingual traders', 'A1 device access; target users cannot use the product without assistance'],
    ['5.3.3 Compatibility', 'O5 — reach across the actual device population', 'C8 external sources behind adapters'],
    ['5.3.4 Maintainability', 'O1, O2 — sustained accuracy over time', 'C1 rules as data; A7 continuing regulatory change'],
    ['5.4.1 Accuracy', 'O1, O2 — correct checklists and credible estimates', 'C2 source and verification date; A2 obtainable regulatory data'],
    ['5.4.2 Legal', 'All — lawful and sustainable operation', 'C3 not a customs authority; C6 data protection'],
  ], { size: 19 }));
  c.push(CAP('Table 5.3. Traceability of non-functional requirement groups to objectives and constraints.'));

  c.push(new Paragraph({ children: [new PageBreak()] }));
};
