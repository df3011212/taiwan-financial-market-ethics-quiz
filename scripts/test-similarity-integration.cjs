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
    this.disabled = false; this.value = ''; this._text = ''; this._html = ''; this._class = new Set();
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
const sandbox={document,console,URL,Blob,Date,Math,Set,Map,clearTimeout(){},setTimeout(){return 1;},
  requestAnimationFrame(fn){fn();},innerWidth:1200,devicePixelRatio:1,
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
test('related comparison returns to the same active practice without counting a new attempt',()=>{
  choose('金融市場常識-033');run('session.answers[0]=session.questions[0].answer;renderQuestion();');
  const active=run('session');
  const before=stat('金融市場常識-033','attempts');
  document.getElementById('quiz').querySelector('[data-sim-related]').click();
  assert.equal(document.getElementById('similarityBack').textContent,'返回目前練習');
  document.getElementById('similarityBack').click();
  assert.equal(run('session'),active);assert.equal(stat('金融市場常識-033','attempts'),before);
  assert.equal(document.getElementById('study').classList.contains('hidden'),false);
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
