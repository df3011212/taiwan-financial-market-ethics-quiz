/* Executes the actual inline quiz script and all three similarity scripts.
 * The DOM shim supplies presentation primitives only; quiz/tracking logic is not replaced. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = require('node:path').resolve(__dirname, '..') + '/';
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
function decode(s) { return String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); }
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentElement = null;
    this.attributes = {}; this.dataset = {}; this.style = {setProperty(k,v) {this[k]=v;}}; this.listeners = {};
    this.disabled = false; this.value = ''; this.scrollTop = 0; this.scrollLeft = 0; this._text = ''; this._html = ''; this._class = new Set();
    this.classList = {add: (...xs) => xs.forEach(x=>this._class.add(x)), remove: (...xs) => xs.forEach(x=>this._class.delete(x)),
      contains: x=>this._class.has(x), toggle: (x,force)=> {const add = force === undefined ? !this._class.has(x) : force; add ? this._class.add(x) : this._class.delete(x); return add;}};
  }
  set className(v) {this._class=new Set(String(v).split(/\s+/).filter(Boolean));}
  get className() {return [...this._class].join(' ');}
  set id(v) {this.attributes.id=String(v);}
  get id() {return this.attributes.id || '';}
  set textContent(v) {this._text=String(v);this.children=[];}
  get textContent() {return this._text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(v) {this._html=String(v);this.children=[];this._text='';parse(String(v),this,this.doc);}
  get innerHTML() {return this._html;}
  setAttribute(k,v) {
    this.attributes[k]=String(v);
    if(k==='class')this.className=v;
    if(k==='value')this.value=decode(v);
    if(k==='disabled')this.disabled=true;
    if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(v);
  }
  getAttribute(k) {return this.attributes[k] ?? null;}
  hasAttribute(k) {return this.attributes[k] !== undefined;}
  removeAttribute(k) {
    delete this.attributes[k];
    if(k==='class')this.className='';
    if(k==='disabled')this.disabled=false;
    if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];
  }
  append(...nodes) {for(const n of nodes) {if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(c=>c!==n);n.parentElement=this;this.children.push(n);}}
  prepend(...nodes) {for(const n of nodes.reverse()) {if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(c=>c!==n);n.parentElement=this;this.children.unshift(n);}}
  before(node) {const p=this.parentElement;const i=p.children.indexOf(this);node.parentElement=p;p.children.splice(i,0,node);}
  insertBefore(node,other) {if(!other)return this.append(node);const i=this.children.indexOf(other);node.parentElement=this;this.children.splice(i,0,node);}
  replaceWith(node) {const p=this.parentElement;const i=p.children.indexOf(this);node.parentElement=p;p.children.splice(i,1,node);this.parentElement=null;}
  replaceChildren(...nodes) {this.children=[];this.append(...nodes);}
  matches(selector) {
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    if(selector.startsWith('.'))return this._class.has(selector.slice(1));
    const a=selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
    if(a)return this.attributes[a[1]]!==undefined&&(a[2]===undefined||this.attributes[a[1]]===a[2]);
    return this.tagName.toLowerCase()===selector.toLowerCase();
  }
  querySelectorAll(selector) {const all=[];for(const c of this.children) {if(c.matches(selector))all.push(c);all.push(...c.querySelectorAll(selector));}return all;}
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  closest(selector) {return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
  addEventListener(type,fn) {(this.listeners[type] ||= []).push(fn);}
  click() {if(this.disabled)return;const event={type:'click',target:this,preventDefault(){}};let el=this;while(el){if(el===this)el.onclick?.(event);for(const fn of el.listeners.click||[])fn(event);el=el.parentElement;}}
  focus() {this.doc.activeElement=this;}
  scrollIntoView() {}
  getBoundingClientRect() {return {left:0,top:0,width:1200,height:800};}
}
function parse(source,parent,doc) {
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const stack=[parent];const pattern=/<!--[\s\S]*?-->|<\/?([\w-]+)([^>]*?)>|([^<]+)/g;let match;
  while((match=pattern.exec(source))) {
    if(match[0].startsWith('<!--'))continue;
    if(match[3]) {stack.at(-1)._text+=decode(match[3]);continue;}
    const tag=match[1].toLowerCase();
    if(match[0].startsWith('</')) {for(let i=stack.length-1;i>0;i--)if(stack[i].tagName.toLowerCase()===tag){stack.length=i;break;}continue;}
    const el=new Element(tag,doc);const attrs=/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let attr;
    while((attr=attrs.exec(match[2]))) {if(attr[1]!=='/')el.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');}
    stack.at(-1).append(el);if(!voids.has(tag)&&!match[0].endsWith('/>'))stack.push(el);
  }
  for(const select of parent.querySelectorAll('select')) {
    const options=select.querySelectorAll('option');const chosen=options.find(o=>o.getAttribute('selected')!==null)||options[0];
    if(chosen)select.value=chosen.getAttribute('value')??chosen.textContent;
  }
}
class Document extends Element {
  constructor() {super('document',null);this.doc=this;this.documentElement=new Element('html',this);this.body=new Element('body',this);this.append(this.documentElement);this.documentElement.append(this.body);}
  getElementById(id) {return this.querySelector('#'+id);}
  createElement(tag) {return new Element(tag,this);}
}
const document=new Document();
parse(html.match(/<body>([\s\S]*?)<script>/)[1],document.body,document);
const local=new Map();let token=0;
const navigation=[];
const location={
  get href(){return 'http://localhost/test-quiz/';},
  set href(value){navigation.push(['href',value]);},
  assign(value){navigation.push(['assign',value]);},
  replace(value){navigation.push(['replace',value]);}
};
const sandbox={document,console,URL,Blob,Date,Math,Set,Map,clearTimeout(){},setTimeout(){return 1;},
  requestAnimationFrame(fn){fn();},innerWidth:1200,devicePixelRatio:1,
  location,open(...args){navigation.push(['open',...args]);},
  crypto:{randomUUID(){return 'test-run-'+(++token);}},
  localStorage:{getItem(k){return local.get(k)||null;},setItem(k,v){local.set(k,v);}},
  speechSynthesis:{cancel(){},speak(){},pause(){},resume(){},paused:false},
  SpeechSynthesisUtterance:function(text){this.text=text;},confirm(){return true;}};
sandbox.window=sandbox;
const context=vm.createContext(sandbox);
function run(code) {return vm.runInContext(code,context);}
run(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
for(const file of ['similarity-data.js','similarity-tracker.js','similarity-ui.js'])run(fs.readFileSync(ROOT+'assets/'+file,'utf8'));
run("$('pdfPanel').classList.add('hidden');");
const results=[];
function test(name,fn) {try{fn();results.push('PASS '+name);}catch(e){results.push('FAIL '+name+': '+e.message);throw e;}}
function stat(qid,field){return run(`SFI_TRACKER.question(${JSON.stringify(qid)})[${JSON.stringify(field)}]`);}
function choose(qid,mode='practice') {run(`startWith([QUESTIONS.find(q=>q.id===${JSON.stringify(qid)})]);session.mode=${JSON.stringify(mode)};`);}
test('checkAnswer -> previous/render -> finish counts the attempt once',()=>{
  choose('金融市場常識-015');
  run('session.answers[0]=1;checkAnswer();renderQuestion();previousQuestion();finish();');
  assert.equal(stat('金融市場常識-015','attempts'),1);assert.equal(stat('金融市場常識-015','wrong'),1);
});
test('actual retry button creates a new session and permits another attempt',()=>{
  run("$('retry').click();session.answers[0]=session.questions[0].answer;checkAnswer();finish();");
  assert.equal(stat('金融市場常識-015','attempts'),2);assert.equal(stat('金融市場常識-015','correct'),1);assert.equal(stat('金融市場常識-015','streak'),1);
});
test('another fresh practice reaches two consecutive correct answers',()=>{
  choose('金融市場常識-015');run('session.answers[0]=session.questions[0].answer;checkAnswer();finish();');
  assert.equal(stat('金融市場常識-015','attempts'),3);assert.equal(run("SFI_TRACKER.stats(['金融市場常識-015']).mastered"),1);
});
test('exam option selection does not record; finish records once',()=>{
  choose('金融市場常識-020','exam');run('renderQuestion();');
  run("$('quiz').querySelectorAll('[data-answer]')[0].click();");
  assert.equal(stat('金融市場常識-020','attempts'),0);
  assert.equal(document.getElementById('quiz').querySelectorAll('[data-sim-related]').every(b=>b.disabled),true);
  run('finish();');assert.equal(stat('金融市場常識-020','attempts'),1);
});
test('listen completion and accidental direct record do not count answers',()=>{
  choose('金融市場常識-021','listen');run('session.answers[0]=session.questions[0].answer;recordSimilarityAnswer(session,0);finish();');
  assert.equal(stat('金融市場常識-021','attempts'),0);
});
test('finishPartial records selected answers and skips nulls',()=>{
  run("startWith(QUESTIONS.filter(q=>q.id==='金融市場常識-022'||q.id==='金融市場常識-023'));session.answers[0]=session.questions[0].answer;finishPartial();");
  assert.equal(stat('金融市場常識-022','attempts'),1);assert.equal(stat('金融市場常識-023','attempts'),0);
});
test('PDF out-of-range jump preserves selected answers and rotates attempt ID',()=>{
  choose('金融市場常識-030');run('session.startAt=30;session.answers[0]=session.questions[0].answer;checkAnswer();');
  const oldId=run('session.similarityAttemptId');
  run("const jumpInput=document.createElement('input');jumpInput.id='studyQuestionNumber';document.body.append(jumpInput);$('studyQuestionNumber').value='40';jumpToStudyQuestion();");
  assert.equal(stat('金融市場常識-030','attempts'),1);assert.equal(run('session.similarityAttemptId'),null);
  run('session.answers[0]=session.questions[0].answer;checkAnswer();');
  assert.notEqual(run('session.similarityAttemptId'),oldId);assert.equal(stat('金融市場常識-040','attempts'),1);
  run("$('studyQuestionNumber').value='30';jumpToStudyQuestion();session.answers[0]=session.questions[0].answer;checkAnswer();finish();");
  assert.equal(stat('金融市場常識-030','attempts'),2);
});
test('PDF range reset saves a selected-but-not-checked answer',()=>{
  choose('金融市場常識-031');run("session.startAt=31;session.answers[0]=session.questions[0].answer;$('studyQuestionNumber').value='45';jumpToStudyQuestion();");
  assert.equal(stat('金融市場常識-031','attempts'),1);
});
test('similarity-group segmentInfo suppresses unrelated next batch',()=>{
  choose('金融市場常識-032');run("session.similarityGroupId='answers-markets';");
  assert.equal(run('segmentInfo().hasNext'),false);
  run('session.answers[0]=session.questions[0].answer;finish();');
  assert.equal(document.getElementById('nextBatch'),null);
  assert.ok(document.getElementById('similarityResultBack'));
});
test('result link opens the requested group beyond page one',()=>{
  const groupId=run("SFI_SIMILARITY.groups.filter(g=>g.kind==='answers')[10].id");
  run(`SFI_SIMILARITY_UI.open('answers',null,${JSON.stringify(groupId)});`);
  const title=run(`SFI_SIMILARITY.groups.find(g=>g.id===${JSON.stringify(groupId)}).title`);
  assert.ok(document.getElementById('similarityDetail').textContent.includes(title));
});
function beginAt(number,mode='practice') {
  run(`$('similarity').classList.add('hidden');$('shell').classList.remove('similarity-wide');
    $('pdfPanel').classList.add('hidden');$('category').value='金融市場常識';$('startAt').value=${number};
    $('amount').value='10';$('order').value='sequence';$('mode').value=${JSON.stringify(mode)};begin();`);
}
function relatedButton(kind) {
  return document.getElementById('quiz').querySelectorAll('[data-sim-related]').find(button=>button.dataset.simRelated===kind);
}
function relatedPanel() {return document.getElementById('similarityRelatedPanel');}
function expectedRelated(qid,kind) {
  return JSON.parse(run(`JSON.stringify([...new Set(SFI_SIMILARITY_UI.allGroups()
    .filter(g=>g.kind===${JSON.stringify(kind)}&&g.questionIds.includes(${JSON.stringify(qid)}))
    .flatMap(g=>g.questionIds))].filter(id=>id!==${JSON.stringify(qid)}&&QUESTIONS.some(q=>q.id===id)))`));
}
function assertOfficialRelated(qid,kind) {
  const panel=relatedPanel();
  assert.ok(panel&&!panel.classList.contains('hidden'),'related panel should be visible below the question');
  assert.equal(panel.dataset.kind,kind);
  const cards=panel.querySelectorAll('[data-related-question]');
  const ids=cards.map(card=>card.dataset.relatedQuestion);
  assert.deepEqual([...ids].sort(),expectedRelated(qid,kind).sort());
  assert.equal(new Set(ids).size,ids.length,'related question cards must be deduplicated');
  assert.ok(!ids.includes(qid),'the current question must be excluded');
  for(const card of cards) {
    const official=JSON.parse(run(`JSON.stringify((()=>{const q=QUESTIONS.find(q=>q.id===${JSON.stringify(card.dataset.relatedQuestion)}),opts=choices(q.text);return {prompt:opts[0],letter:LETTERS[q.answer-1],answer:opts[q.answer]};})())`));
    assert.equal(card.querySelector('h4').textContent,official.prompt);
    assert.equal(card.querySelector('.similarity-related-answer').textContent,`正確答案 ${official.letter}：${official.answer}`);
  }
  for(const selector of ['[data-sim-single]','[data-sim-practice]','[data-sim-group]','a']) {
    assert.equal(panel.querySelectorAll(selector).length,0,'inline cards must not contain practice or group navigation');
  }
  assert.ok(!/單題練習|練習本組|追蹤這一組/.test(panel.textContent));
  assert.equal(relatedButton(kind).getAttribute('aria-expanded'),'true');
  assert.equal(relatedButton(kind).getAttribute('aria-controls'),'similarityRelatedPanel');
}
function snapshotPractice() {
  return {session:run('session'),questions:run('session.questions'),answers:run('session.answers'),checked:run('session.checked'),
    serialized:run('JSON.stringify(session)'),tracker:run('JSON.stringify(SFI_TRACKER.exportData())'),
    questionElement:document.getElementById('quiz').querySelector('.question'),
    optionElements:document.getElementById('quiz').querySelectorAll('[data-answer]'),
    scroll:['quiz','pdfScroll'].map(id=>[id,document.getElementById(id).scrollTop,document.getElementById(id).scrollLeft]),
    classes:['shell','study','pdfPanel','quiz','setup','bank','result','similarity'].map(id=>[id,document.getElementById(id).className]),
    navigation:navigation.length};
}
function assertPracticeUnchanged(before) {
  assert.equal(run('session'),before.session);assert.equal(run('session.questions'),before.questions);
  assert.equal(run('session.answers'),before.answers);assert.equal(run('session.checked'),before.checked);
  assert.equal(run('JSON.stringify(session)'),before.serialized,'session/index/selection/checked must remain unchanged');
  assert.equal(run('JSON.stringify(SFI_TRACKER.exportData())'),before.tracker,'comparison must not record attempts');
  assert.equal(document.getElementById('quiz').querySelector('.question'),before.questionElement,'opening comparison must not rerender the current question');
  document.getElementById('quiz').querySelectorAll('[data-answer]').forEach((element,index)=>assert.equal(element,before.optionElements[index],'answer buttons must remain the same DOM nodes'));
  for(const [id,top,left] of before.scroll) {assert.equal(document.getElementById(id).scrollTop,top);assert.equal(document.getElementById(id).scrollLeft,left);}
  for(const [id,className] of before.classes)assert.equal(document.getElementById(id).className,className,`${id} layout/visibility must remain unchanged`);
  assert.equal(navigation.length,before.navigation,'comparison must not navigate or open another window');
}
function assertRelatedCollapsed() {
  assert.ok(relatedPanel().classList.contains('hidden'));
  assert.equal(relatedPanel().querySelectorAll('[data-related-question]').length,0);
  assert.equal(relatedPanel().querySelectorAll('.similarity-related-answer').length,0);
  for(const button of document.getElementById('quiz').querySelectorAll('[data-sim-related]'))assert.equal(button.getAttribute('aria-expanded'),'false');
}
test('q171 answer comparison expands inline with official answers, deduplication, and no practice navigation',()=>{
  beginAt(171);
  document.getElementById('quiz').querySelectorAll('[data-answer]')[1].click();
  // Overlapping groups must still produce one card per related question.
  run("SFI_SIMILARITY.groups.push({id:'test-overlapping-underwriting',kind:'answers',title:'test duplicate coverage',description:'',questionIds:['金融市場常識-171','金融市場常識-168']});");
  assertRelatedCollapsed();
  const before=snapshotPractice();
  relatedButton('answers').click();assertOfficialRelated('金融市場常識-171','answers');
  assertPracticeUnchanged(before);
  assert.equal(relatedPanel().querySelectorAll('[data-related-question]').length,2);
  run("SFI_SIMILARITY.groups.splice(SFI_SIMILARITY.groups.findIndex(g=>g.id==='test-overlapping-underwriting'),1);");
});
test('switching q171 comparison type updates one inline panel; clicking again collapses it',()=>{
  const before=snapshotPractice();
  relatedButton('questions').click();assertOfficialRelated('金融市場常識-171','questions');
  assert.equal(relatedButton('answers').getAttribute('aria-expanded'),'false');
  assertPracticeUnchanged(before);
  relatedButton('questions').click();assertRelatedCollapsed();assertPracticeUnchanged(before);
  relatedButton('answers').click();document.getElementById('similarityRelatedClose').click();
  assertRelatedCollapsed();assertPracticeUnchanged(before);
});
test('inline comparison preserves the visible PDF pane and active quiz layout',()=>{
  run("$('pdfPanel').classList.remove('hidden');$('study').classList.remove('single-column');$('shell').classList.add('wide');");
  run("$('pdfScroll').scrollTop=180;$('quiz').scrollTop=94;");
  const before=snapshotPractice();relatedButton('answers').click();assertOfficialRelated('金融市場常識-171','answers');
  assertPracticeUnchanged(before);
  document.getElementById('similarityRelatedClose').click();assertPracticeUnchanged(before);
  // Restore the ordinary quiz layout before exercising real question rendering.
  run("$('pdfPanel').classList.add('hidden');$('study').classList.add('single-column');$('shell').classList.remove('wide');");
});
test('next and previous question navigation discards the prior inline comparison',()=>{
  relatedButton('answers').click();assertOfficialRelated('金融市場常識-171','answers');
  document.getElementById('next').click();assert.equal(run('session.questions[session.index].number'),172);
  assertRelatedCollapsed();
  relatedButton('questions').click();
  document.getElementById('previous').click();assert.equal(run('session.questions[session.index].number'),171);
  assertRelatedCollapsed();
});
test('confirming an answer clears old inline cards and preserves the submitted selection',()=>{
  relatedButton('answers').click();assertOfficialRelated('金融市場常識-171','answers');
  const selected=run('session.answers[session.index]');document.getElementById('check').click();
  assert.equal(run('session.checked[session.index]'),true);assert.equal(run('session.answers[session.index]'),selected);
  assertRelatedCollapsed();
});
test('exam comparison controls and their handlers cannot expose official answers before submission',()=>{
  beginAt(171,'exam');const before=snapshotPractice();
  for(const kind of ['answers','questions']) {
    const button=relatedButton(kind);assert.equal(button.disabled,true);button.click();
    assertRelatedCollapsed();button.onclick();assertRelatedCollapsed();
  }
  assertPracticeUnchanged(before);
});
test('a question with zero related questions expands a safe empty state inline',()=>{
  beginAt(2);assert.deepEqual(expectedRelated('金融市場常識-002','answers'),[]);
  assert.deepEqual(expectedRelated('金融市場常識-002','questions'),[]);
  const before=snapshotPractice();
  for(const kind of ['answers','questions']) {
    relatedButton(kind).click();assertOfficialRelated('金融市場常識-002',kind);
    assert.ok(relatedPanel().textContent.includes('目前沒有其他可對照的題目。'));
    assert.equal(relatedPanel().querySelectorAll('.similarity-related-answer').length,0);
    assertPracticeUnchanged(before);
  }
});
test('empty tracked list is safe and both pagination buttons are disabled',()=>{
  run("SFI_SIMILARITY_UI.open('tracked');");
  assert.equal(document.getElementById('similarityPage').textContent,'0 / 0');
  assert.equal(document.getElementById('similarityPrev').disabled,true);
  assert.equal(document.getElementById('similarityNext').disabled,true);
  assert.ok(document.getElementById('similarityGroups').textContent.includes('沒有符合'));
});
console.log(results.join('\n'));
console.log('PASS: actual index hooks, actual UI wrappers, actual tracker; presentation-only DOM shim.');
