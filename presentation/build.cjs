const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Ethical Dilemmas in Modern Business: Cases 5-8";

const NAVY="14213D", INK="1B1B1B", AMBER="F2A900", PAPER="FFFFFF", TINT="F1F3F8", MUTED="5B6478", CARD="E4E8F1";
const HF="Cambria", BF="Calibri";

function base(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  s.addText(kicker, { x:0.5, y:0.3, w:9, h:0.3, fontFace:BF, fontSize:12, bold:true, color:AMBER, isTextBox:true, margin:0 });
  s.addText(title, { x:0.5, y:0.6, w:9, h:0.6, fontFace:HF, fontSize:28, bold:true, color:NAVY, isTextBox:true, margin:0 });
  return s;
}
function card(s, x, y, w, h, head, bullets, opts={}) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill:{color: opts.fill||TINT}, line:{color: opts.fill||TINT} });
  s.addText(head, { x:x+0.2, y:y+0.12, w:w-0.4, h:0.35, fontFace:HF, fontSize:15, bold:true, color: opts.headColor||NAVY, isTextBox:true, margin:0 });
  const items = bullets.map((b,i)=>({ text:b, options:{ bullet:true, breakLine:i<bullets.length-1, paraSpaceAfter:5 } }));
  s.addText(items, { x:x+0.2, y:y+0.52, w:w-0.4, h:h-0.62, fontFace:BF, fontSize: opts.size||12.5, color: opts.color||INK, valign:"top", isTextBox:true, margin:0 });
}
function badge(s, n) {
  s.addShape(pres.shapes.OVAL, { x:8.9, y:0.3, w:0.6, h:0.6, fill:{color:NAVY}, line:{color:NAVY} });
  s.addText(String(n), { x:8.9, y:0.3, w:0.6, h:0.6, fontFace:HF, fontSize:20, bold:true, color:AMBER, align:"center", valign:"middle", isTextBox:true, margin:0 });
}

// Title slide
let s = pres.addSlide(); s.background = { color: NAVY };
s.addText("Ethical Dilemmas in Modern Business", { x:0.7, y:1.2, w:8.6, h:1.5, fontFace:HF, fontSize:40, bold:true, color:"FFFFFF", isTextBox:true, margin:0 });
s.addText("Case Analysis: Amazon · Wells Fargo · Boeing Whistleblowers · Meta", { x:0.7, y:2.8, w:8.6, h:0.5, fontFace:BF, fontSize:18, color:AMBER, isTextBox:true, margin:0 });
s.addText("Cases 5–8  |  Group Presentation", { x:0.7, y:4.6, w:8.6, h:0.4, fontFace:BF, fontSize:14, color:"CADCFC", isTextBox:true, margin:0 });
s.addNotes("Introduce the group and the four cases we were assigned: 5 Amazon, 6 Wells Fargo, 7 Boeing whistleblowers, 8 Meta.");

// Framework overview
s = base("Four Types of Ethical Dilemmas", "OUR LENS");
const types = [
  ["Nonrole","Moral conflict not created by the job description; person acts as citizen, coworker, or conscience-driven individual."],
  ["Role Failure","A defined duty (safety, risk, accuracy) is not fulfilled."],
  ["Role Distortion","Legitimate duties twisted by incentives, pressure, or culture."],
  ["Role Assertion","Acting on ethical duties beyond the formal job, at personal risk."],
];
types.forEach((t,i)=>{
  const x = 0.5 + (i%2)*4.6, y = 1.5 + Math.floor(i/2)*1.9;
  card(s, x, y, 4.4, 1.7, t[0], [t[1]], { size:13 });
});
s.addText("Case 5 Amazon → Nonrole   |   Case 6 Wells Fargo → Role Distortion   |   Case 7 Boeing → Role Assertion   |   Case 8 Meta → Nonrole", { x:0.5, y:4.85, w:9, h:0.5, fontFace:BF, fontSize:11, color:MUTED, isTextBox:true, margin:0 });

// ---------- CASE DATA ----------
const cases = [
 { n:5, co:"Amazon", title:"Warehouse Workers & Safety Reporting", kick:"CASE 5 · AMAZON · 2023",
   summary:[
    "Warehouse workers and labor advocates raised concerns about injuries, fast production quotas, and work pace.",
    "OSHA cited Amazon at several U.S. warehouses (2022–23) for ergonomic hazards; a 2024 U.S. Senate HELP Committee report also criticized its injury rates. Amazon disputes these findings and says it invests heavily in safety.",
    "Workers had to choose: report hazards, or stay silent to protect hours, evaluations, and jobs."],
   type:"Nonrole", typeWhy:[
    "The dilemma comes from personal circumstances, not a job duty: an individual weighing self-protection and coworker safety against income.",
    "Best supporting frameworks: rights-based ethics (right to a safe workplace) and utilitarianism (fewer injuries, greater total welfare)."],
   stake:[["Warehouse workers","Injury risk, job security"],["Coworkers & supervisors","Peer pressure, quota targets"],["Amazon management","Productivity vs. safety"],["Customers","Expect fast delivery"],["Shareholders","Costs, reputation"],["OSHA / regulators","Enforce safety law"]],
   impact:[
    "Legal & financial: OSHA citations, fines, workers' comp costs, and turnover that raises training costs.",
    "Reputation: sustained media and Senate scrutiny hurts hiring and brand trust.",
    "Operational: injured or burned-out workers reduce output; unions and organizing efforts grow."],
   sols:[
    ["Anonymous, no-retaliation reporting","Third-party hotline plus written anti-retaliation policy; report safety data to leadership and the board."],
    ["Safety-adjusted metrics","Remove injury reporting from productivity scoring; slow rates when hazards are flagged; add worker safety committees."],
    ["Independent safety audits","External ergonomic audits with public results and corrective deadlines."]],
   best:"Anonymous reporting plus safety-adjusted metrics: it removes the choice between safety and employment, which is the root of the dilemma, and can be started quickly at low cost.",
   notes:"Type: Nonrole. Distinguish verified facts (OSHA citations) from allegations. Verify latest status before presenting." },
 { n:6, co:"Wells Fargo", title:"Unauthorized Accounts Scandal", kick:"CASE 6 · WELLS FARGO · 2023–2024",
   summary:[
    "Employees opened accounts and enrolled customers in products without authorization to meet aggressive sales targets.",
    "Regulators (CFPB, OCC, Federal Reserve, DOJ, SEC) fined the bank billions over the years; in 2018 the Fed capped its assets until reforms were made.",
    "Thousands of employees were fired; customers paid fees and suffered credit damage."],
   type:"Role Distortion", typeWhy:[
    "The job is serving customers with suitable products. Quotas and bonuses redefined “good service” as “number of accounts sold.”",
    "Best supporting frameworks: duty-based ethics (duty of honesty and consent) and justice ethics (customers bore harm for employee targets)."],
   stake:[["Customers","Fees, credit damage, lost trust"],["Frontline employees","Pressure, firing, fear"],["Managers & executives","Set targets and culture"],["Board & shareholders","Losses, governance"],["Regulators","CFPB, OCC, Fed, DOJ"],["Whistleblowers","Ethics-line reporters"]],
   impact:[
    "Financial: multi-billion-dollar penalties, customer remediation, and legal costs.",
    "Regulatory: asset cap, leadership turnover, and mandated governance reforms.",
    "Reputation: loss of customer trust, lower account growth, and years of rebuilding."],
   sols:[
    ["Redesign incentives","Replace quotas with customer satisfaction, retention, and quality metrics; use clawbacks for misconduct."],
    ["Strengthen controls & consent","Verify customer consent digitally for every new account; audit unusual opening patterns."],
    ["Protect ethics-line reporters","Independent hotline reporting to the board, with anti-retaliation enforcement."]],
   best:"Redesign incentives: the misconduct came from the reward system, so controls and hotlines alone treat symptoms. Pair it with digital consent checks.",
   notes:"Type: Role Distortion. Note asset cap status changed after 2024 - verify with Federal Reserve." },
 { n:7, co:"Boeing", title:"Whistleblowers & Safety Concerns", kick:"CASE 7 · BOEING · 2024",
   summary:[
    "Employees such as John Barnett and Sam Salehpour raised concerns about manufacturing and quality control.",
    "After the January 2024 Alaska Airlines door-plug blowout, scrutiny grew. Barnett died in March 2024 (ruled a suicide) before finishing testimony in his retaliation case.",
    "Whistleblowers testified to the Senate; the FAA and Congress investigated."],
   type:"Role Assertion", typeWhy:[
    "Employees acted beyond their job descriptions to protect passengers, risking careers, legal cost, and personal well-being.",
    "Best supporting frameworks: duty-based ethics (protect the public) and virtue ethics (courage, integrity)."],
   stake:[["Whistleblowers","Retaliation, stress, legal cost"],["Passengers & crews","Physical safety"],["Boeing leadership","Reputation, liability"],["Airlines & suppliers","Groundings, delays"],["FAA & Congress","Oversight duty"],["Shareholders","Value, trust"]],
   impact:[
    "Regulatory: FAA production cap on 737 MAX, audits, investigations, and hearings.",
    "Financial: delivery delays, cash burn, and legal exposure; CEO turnover in 2024.",
    "Reputation: safety culture questioned; retaliation claims discourage future reporting."],
   sols:[
    ["Independent safety speak-up system","Confidential channel to a board safety committee, with tracked responses and deadlines."],
    ["Enforced anti-retaliation policy","Fast, neutral review of retaliation claims; discipline managers who retaliate; legal support for good-faith reporters."],
    ["Safety metrics in executive pay","Tie bonuses to quality and safety indicators, not just deliveries."]],
   best:"An independent speak-up system with enforced anti-retaliation protection: it makes internal reporting credible, so employees needn't go to regulators or media first, and structured review screens out unsupported claims.",
   notes:"Type: Role Assertion. Be sensitive about Barnett's death. State only that authorities ruled it a suicide." },
 { n:8, co:"Meta", title:"Employees & AI Projects", kick:"CASE 8 · META · 2024",
   summary:[
    "Employees in the tech industry, including at Meta, voiced worries about AI misinformation, discrimination, privacy, and misuse of generative AI.",
    "Reported issues include using public posts for AI training (which drew European regulator attention in 2024) and internal AI chatbot guidelines criticized in 2025.",
    "Individuals had to choose: keep working, request safeguards, raise concerns, transfer, or leave."],
   type:"Nonrole", typeWhy:[
    "Employees are rarely the final decision-makers; the conflict is between personal conscience and participating in a project with both benefits and risks.",
    "Best supporting frameworks: virtue ethics (integrity) and utilitarianism (weigh social benefits vs. harms)."],
   stake:[["Meta employees","Conscience vs. career"],["Users & minors","Privacy, safety, misinformation"],["Meta leadership","Speed vs. safeguards"],["Shareholders","AI investment returns"],["Regulators","Privacy, AI laws"],["Society","Trust in information"]],
   impact:[
    "Regulatory: privacy investigations and pressure from AI and child-safety laws.",
    "Talent: unaddressed concerns lead to attrition and leaks.",
    "Reputation: AI incidents can quickly erode user and advertiser trust."],
   sols:[
    ["Internal AI ethics review","Cross-functional board that must approve high-risk launches; documented risk assessments."],
    ["Conscientious objection policy","Let employees transfer off objectionable projects without penalty."],
    ["Transparent safety reporting","Publish model cards, red-team results, and limits."]],
   best:"Internal AI ethics review with a conscientious-objection option: it gives employees a real voice inside the company, which is more effective than leaving, and reduces harm before launch.",
   notes:"Type: Nonrole. This case is more general than the others; use current, cited sources for specific events." },
];

cases.forEach(c=>{
  // A: summary + type
  s = base(c.title, c.kick); badge(s,c.n);
  card(s, 0.5, 1.5, 5.4, 3.5, "1 · Summary of the Issue", c.summary, { size:12 });
  s.addShape(pres.shapes.RECTANGLE, { x:6.1, y:1.5, w:3.4, h:3.5, fill:{color:NAVY}, line:{color:NAVY} });
  s.addText("2 · Type of Ethical Issue", { x:6.3, y:1.62, w:3.0, h:0.35, fontFace:HF, fontSize:15, bold:true, color:"FFFFFF", isTextBox:true, margin:0 });
  s.addText(c.type, { x:6.3, y:2.05, w:3.0, h:0.5, fontFace:HF, fontSize:24, bold:true, color:AMBER, isTextBox:true, margin:0 });
  s.addText(c.typeWhy.map((t,i)=>({text:t, options:{breakLine:i<c.typeWhy.length-1, paraSpaceAfter:6}})), { x:6.3, y:2.65, w:3.0, h:2.25, fontFace:BF, fontSize:11.5, color:"FFFFFF", valign:"top", isTextBox:true, margin:0 });
  s.addNotes(c.notes);

  // B: stakeholders + impact
  s = base(c.co+": Stakeholders & Impact", c.kick); badge(s,c.n);
  s.addText("3 · Stakeholders", { x:0.5, y:1.4, w:4.5, h:0.35, fontFace:HF, fontSize:15, bold:true, color:NAVY, isTextBox:true, margin:0 });
  c.stake.forEach((st,i)=>{
    const x = 0.5 + (i%2)*2.3, y = 1.85 + Math.floor(i/2)*1.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w:2.15, h:0.92, fill:{color:TINT}, line:{color:CARD}, rectRadius:0.08 });
    s.addText([{text:st[0], options:{bold:true, breakLine:true, color:NAVY, fontSize:12}},{text:st[1], options:{color:MUTED, fontSize:10.5}}], { x:x+0.1, y:y+0.05, w:1.95, h:0.82, fontFace:BF, valign:"middle", isTextBox:true, margin:0 });
  });
  card(s, 5.2, 1.4, 4.3, 3.6, "4 · Impact on the Company", c.impact, { size:12, fill:NAVY, color:"FFFFFF", headColor:AMBER });

  // C: solutions + best
  s = base(c.co+": Solutions & Recommendation", c.kick); badge(s,c.n);
  c.sols.forEach((so,i)=>{
    const x = 0.5 + i*3.05;
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.45, w:2.9, h:2.35, fill:{color:TINT}, line:{color:TINT} });
    s.addShape(pres.shapes.OVAL, { x:x+0.15, y:1.58, w:0.38, h:0.38, fill:{color:NAVY}, line:{color:NAVY} });
    s.addText(String(i+1), { x:x+0.15, y:1.58, w:0.38, h:0.38, fontFace:HF, fontSize:13, bold:true, color:AMBER, align:"center", valign:"middle", isTextBox:true, margin:0 });
    s.addText(so[0], { x:x+0.62, y:1.55, w:2.15, h:0.5, fontFace:HF, fontSize:12.5, bold:true, color:NAVY, valign:"middle", isTextBox:true, margin:0 });
    s.addText(so[1], { x:x+0.15, y:2.15, w:2.6, h:1.6, fontFace:BF, fontSize:11.5, color:INK, valign:"top", isTextBox:true, margin:0 });
  });
  s.addText("5 · Possible Solutions", { x:6.5, y:0.32, w:2.3, h:0.28, fontFace:BF, fontSize:10, color:MUTED, align:"right", isTextBox:true, margin:0 });
  s.addShape(pres.shapes.RECTANGLE, { x:0.5, y:4.0, w:9, h:1.1, fill:{color:NAVY}, line:{color:NAVY} });
  s.addText("6 · BEST SOLUTION", { x:0.7, y:4.08, w:3, h:0.3, fontFace:BF, fontSize:11, bold:true, color:AMBER, isTextBox:true, margin:0 });
  s.addText(c.best, { x:0.7, y:4.38, w:8.6, h:0.65, fontFace:BF, fontSize:12.5, color:"FFFFFF", valign:"top", isTextBox:true, margin:0 });
});

// Sources
s = base("Sources & Further Reading", "REFERENCES");
s.addText([
 "U.S. OSHA: Amazon warehouse ergonomic citations (2022–2023); U.S. Senate HELP Committee report on Amazon worker safety (2024)",
 "CFPB, OCC, Federal Reserve, DOJ, SEC: Wells Fargo enforcement actions and settlements (2016–2024)",
 "U.S. Senate Permanent Subcommittee on Investigations: Boeing whistleblower hearing (April 2024); FAA investigation of Alaska Airlines Flight 1282 and the 737 MAX production cap",
 "FAA Expert Panel review of Boeing's safety culture (February 2024)",
 "Irish Data Protection Commission and Reuters reporting on Meta's AI data use and chatbot guidelines",
 "Note: verify current facts and status before presenting; ongoing matters may have changed."
].map((t,i,a)=>({text:t, options:{bullet:true, breakLine:i<a.length-1, paraSpaceAfter:8}})), { x:0.5, y:1.5, w:9, h:3.5, fontFace:BF, fontSize:13, color:INK, valign:"top", isTextBox:true, margin:0 });

pres.writeFile({ fileName:"/home/user/Malik-s-Repository/presentation/Ethical_Dilemmas_Cases_5-8.pptx" }).then(()=>console.log("done"));
