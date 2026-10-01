# Payroll Audit: business validation (pilot hypotheses, not proven results)

## Product boundaries
- The public dashboard currently parses payslips and attendance records locally and highlights discrepancies. A discrepancy is NOT proof of underpayment.
- "Potential amount" must remain unknown unless an entitlement rule, hours, rate, payment lag and correcting transactions are independently verified.
- "Recovered money" stays blank/zero until the employee confirms actual receipt with reliable evidence. Never invent an audit accuracy percentage, payment, ROI or sector benchmark.
- Cross-user pilot analytics and any remote storage remain DISABLED until separate privacy and authentication review.

## Revenue experiments, not advertised price commitments
1. **Free first look**: local upload, summarized suspected anomalies. Keep self-service access and an exportable general explanation.
2. **Paid technical audit (pilot price test: ₪79–149)**: multi-month reconciliation, human-readable evidence ledger, document parsing review and a factual payroll-query letter; no claim of legal representation. Measure conversion and refund requests.
3. **Professional escalation (optional separate pricing, initially ₪249–499 as test)**: an independently engaged payroll professional, certified wage checker when scope requires it, and/or licensed labor attorney; written scope, who bills, and lawful referral/commission arrangements reviewed first. Do not promise legal outcomes.
4. Later evaluate B2B software licensing to worker associations and practitioners only if consent, confidentiality and employer-independent audit integrity can be demonstrated.

## Jurisdiction guardrails (Israel; verify before launch)
- Ministry of Labor complaint channel is regulatory enforcement, explicitly not a mechanism for the employee to receive compensation: https://www.gov.il/he/service/work-rights-violation-complaints
- Employees can use labor-court/ODR channels for recovery when needed; some claims carry fees or exemptions: https://www.gov.il/he/service/managing-and-resolving-legal-disputes
- Professional legal advice, representation and drafting legal documents are restricted professional acts under the Lawyers Bar Law; the app should produce factual payroll enquiry material only without attorney review: https://he.wikisource.org/wiki/חוק_לשכת_עורכי_הדין
- "Certified wage checker" is a credentialed profession with a Ministry of Labor registry; software cannot represent itself as such: https://www.gov.il/he/service/registration-as-a-certified-wage-checker
- Wage and financial activity data are specially sensitive under the privacy amendments; consent and data minimization alone do not replace privacy/security duties: https://www.gov.il/he/pages/tikun13_qa?chapterIndex=6

## 20-volunteer pilot acceptance criteria (thresholds to test, not claims)
- At least 20 voluntary users representing multiple payroll formats/agreements if possible, not just one employer.
- Each person confirms explicit use purpose and whether diagnostics (not source documents) may be pooled; no sharing without opt-in.
- Human-verification sample of parsing: month assignment and amount/rate/quantity field precision; target ≥98% for critical field-level readings and zero fabricated monetary recommendations.
- Record false-positive reasons: leave, late payroll, overtime redistribution, missing attendance scans, employment-agreement exceptions, already-paid corrections.
- Each finding has a lifecycle: SUSPECTED → REVIEWED → ELIGIBLE_VERIFIED → REQUEST_SUBMITTED → RECOVERED_VERIFIED (or RESOLVED_NO_DEBT). Include dates/evidence without storing source documents centrally.
- Business metrics: cost per audit, minutes of human review, willingness to pay, report completion rate, evidence-confirmed findings, employees reporting received repayments. Do not publish aggregate claims from small groups.

## Multi-year payroll history
- Chart only observed months. Empty months remain gaps; user-estimated starting wage of approximately ₪35.8 is not an observed payroll record.
- Chart hourly pay separately from gross, net, fixed base salary, extras, on-call pay and attendance hours; highlight employment-contract and salary-grade changes only when records substantiate them.
- Wage variation can be legitimate due to seniority, agreements, additional shifts, indexing, holidays and changes in position.
- Imported JSON data packs remain on the user's device; future server-based encrypted storage requires dedicated threat-model and legal/privacy review before enabling.
