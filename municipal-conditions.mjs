// Source-backed research checkpoints. Historical audits are not current
// collective agreements and never authorize automatic wage/debt arithmetic.
const city='https://www.tel-aviv.gov.il/';
const audit2023=city+'mevaker/DocLib14/2023/'+encodeURIComponent('דוח תשלום רכיבי שכר משלימים.pdf');
const audit2017=city+'mevaker/DocLib14/2017/'+encodeURIComponent('תשלומי שכר לעובדי העירייה.pdf');
export const MUNICIPAL_CONDITIONS=Object.freeze([
 {id:'oncall-absence',title:'כוננות בזמן היעדרות',source:audit2023,sourceYear:2023,
  locator:'עמוד מודפס 161, סעיפים 383–391',
  evidence:'דוח הביקורת מתאר הקצאת כוננויות לפי התפקיד והצורך, ואי תשלום בתקופות היעדרות המונעות כוננות.',
  question:'לפני בירור ירידה בכוננות: האם היו חופשה, מחלה, מילואים או שינוי בהקצאה בחודש העבודה?',
  required:['דוח היעדרויות','הקצאת כוננויות מאושרת','הוראה עדכנית החלה על העובד']},
 {id:'inspection-shifts',title:'משמרות אגף הפיקוח',source:audit2023,sourceYear:2023,
  locator:'עמוד מודפס 113, סעיפים 270–272',
  evidence:'בדוח מופיעים הסדרי משמרות נפרדים למפקחים ולמנהלים; מתוארים גם חלונות שעות חופפים.',
  question:'נדרש קוד הסכם המשמרות העדכני, התפקיד ושעות הכניסה והיציאה. אין להחיל את טבלת 2023 על חודשים חדשים ללא אישור.',
  required:['קוד הסכם נוכחות','תפקיד','הסדר משמרות עדכני','שעות יומיות']},
 {id:'legacy-allowances',title:'תוספות מקומיות ומועד הקליטה',source:audit2017,sourceYear:2017,
  locator:'עמודים 6–7 ו־12–13, סעיפים 27–32 ו־47–56',
  evidence:'הביקורת מבחינה בין עובדים ותיקים לחדשים, ובין תוספות מקומיות והסדרי קידום מתקופות שונות.',
  question:'תוספת שקיימת אצל עמית אינה מוכיחה זכאות אישית. יש לאמת מועד קליטה, תפקיד והסכם מאושר.',
  required:['מועד קליטה','דירוג ודרגה','תפקיד','אישור תוספת והסכם עדכני']},
 {id:'grade-progress',title:'קידום בדרגה ובוותק',source:audit2017,sourceYear:2017,
  locator:'עמודים 7–8, סעיפים 33–37',
  evidence:'הדוח מתאר מתח דרגות ומסלול קידום, תוך הבחנה בין דרגת שהייה לדרגה אישית.',
  question:'יש להשוות את הדרגה ומועד העדכון לאישור המשרה ולמסלול הקידום העדכני; אין להסיק זכאות מלוח היסטורי בלבד.',
  required:['מתח דרגות בתקן','מועד הדרגה האחרונה','כללי קידום עדכניים']}
].map(x=>Object.freeze({...x,checkedAt:'2026-10-05',status:'requires-current-applicability',automaticEntitlement:false})));
export function municipalCheckpoints({employer,department}={}){
 if(employer!=='tel-aviv-yafo'||department!=='municipal-inspection')return [];
 return MUNICIPAL_CONDITIONS;
}
const panel=typeof document==='undefined'?null:document.getElementById('municipalConditions');
if(panel){
 const select=document.getElementById('municipalProfile');
 const render=()=>{
  panel.replaceChildren();
  const checks=municipalCheckpoints(select.value==='inspection'?
   {employer:'tel-aviv-yafo',department:'municipal-inspection'}:{});
  if(!checks.length){panel.textContent='בחרו את פרופיל ההעסקה כדי להציג מקורות ונקודות לבירור.';return;}
  for(const rule of checks){
   const details=document.createElement('details'),summary=document.createElement('summary');
   summary.textContent=rule.title+' — נדרש אימות תחולה';details.append(summary);
   for(const text of [rule.evidence,rule.question,'מסמכים נדרשים: '+rule.required.join(', ')]){
    const p=document.createElement('p');p.textContent=text;details.append(p);
   }
   const link=document.createElement('a');link.href=rule.source;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='מקור עירוני '+rule.sourceYear+' · '+rule.locator;details.append(link);panel.append(details);
  }
 };
 select.addEventListener('change',render);render();
}
