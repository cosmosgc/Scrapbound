const CONTRACTS = [
  { id:'first-haul', title:'A little delivery goes a long way', brief:'Deliver 4 cargo units to the depot.', goal:4, reward:{credits:30,scrap:12}, test:e=>e.type==='delivery', amount:e=>e.cargo||0 },
  { id:'teamwork', title:'Teamwork makes the dream work', brief:'Deliver cargo from two different robot buddies.', goal:2, reward:{credits:45,scrap:18}, test:e=>e.type==='delivery', amount:e=>1, unique:'robotId' },
  { id:'busy-bees', title:'Keep the factory buzzing', brief:'Complete 5 depot deliveries.', goal:5, reward:{credits:70,scrap:28}, test:e=>e.type==='delivery', amount:e=>1 },
  { id:'big-haul', title:'The big haul', brief:'Deliver 20 cargo units in one factory cycle.', goal:20, reward:{credits:100,scrap:45}, test:e=>e.type==='delivery', amount:e=>e.cargo||0 },
];
const KEY='scrapbound.operations.v1';
const fresh=()=>({index:0,progress:0,claimable:false,claimed:[],seen:[],helpers:[]});
export class Operations {
 constructor(economy,refresh,notify){this.economy=economy;this.refresh=refresh;this.notify=notify;try{this.state={...fresh(),...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{this.state=fresh();}this.account=false;}
 persist(){localStorage.setItem(KEY,JSON.stringify(this.state));}
 update(snapshot){const c=CONTRACTS[this.state.index];if(!c||this.state.claimable)return;let changed=false;
  for(const e of snapshot.events||[]){if(!c.test(e))continue;const signature=`${e.id}:${e.elapsed}:${e.robotId}:${e.cargo}:${e.amount}`;if(this.state.seen.includes(signature))continue;this.state.seen.push(signature);if(this.state.seen.length>300)this.state.seen.splice(0,this.state.seen.length-300);changed=true;
   if(c.unique){if(!this.state.helpers.includes(e[c.unique])){this.state.helpers.push(e[c.unique]);this.state.progress=this.state.helpers.length;}}
   else this.state.progress+=c.amount(e);
   if(this.state.progress>=c.goal){this.state.progress=c.goal;this.state.claimable=true;this.notify('Contract complete! Your delivery crew did it.');}
  }if(changed)this.persist();}
 render(host,account){this.account=account;const c=CONTRACTS[this.state.index];if(!c){host.innerHTML='<div class="contract-card contract-finished"><span class="contract-icon">🏆</span><div><small>FACTORY CONTRACTS</small><h3>All caught up!</h3><p>Your crew completed every contract. More adventures are on the way.</p></div></div>';return;}
 const percent=Math.round(this.state.progress/c.goal*100);host.innerHTML=`<div class="contract-card"><div class="contract-icon">${this.state.claimable?'🎉':'📦'}</div><div class="contract-copy"><span class="eyebrow">${account?'CREW CHALLENGE':'FACTORY CONTRACT'} · ${this.state.index+1} / ${CONTRACTS.length}</span><h3>${c.title}</h3><p>${c.brief}</p><div class="contract-meter"><progress max="${c.goal}" value="${this.state.progress}"></progress><b>${this.state.progress} / ${c.goal}</b></div><small class="contract-reward">REWARD · ¢ ${c.reward.credits} + ▧ ${c.reward.scrap}${account?' · local rewards disabled while signed in':''}</small></div>${this.state.claimable&&!account?'<button class="button button-primary" data-contract-claim>Claim reward</button>':''}</div>`;}
 claim(){const c=CONTRACTS[this.state.index];if(!c||!this.state.claimable||this.account)return false;this.economy.state.credits+=c.reward.credits;this.economy.state.scrap+=c.reward.scrap;this.economy.state.lifetimeCredits+=c.reward.credits;this.economy.persist();this.state.claimed.push(c.id);this.state.index++;this.state.progress=0;this.state.claimable=false;this.state.helpers=[];this.persist();this.notify('Reward delivered! Pick your next factory goal.');this.refresh();return true;}
 bind(host){host.addEventListener('click',e=>{if(e.target.closest('[data-contract-claim]'))this.claim();});}
}
const COLORS=['mint','berry','sunshine','ocean','lilac'];
const COSMETICS=[{id:'cap',name:'Builder cap',icon:'🧢',cost:12},{id:'antenna',name:'Star antenna',icon:'⭐',cost:20},{id:'trail',name:'Rainbow trail',icon:'🌈',cost:30}];
export class BuddyStyle {
 constructor(economy,refresh,notify){this.economy=economy;this.refresh=refresh;this.notify=notify;this.account=false;}
 render(host,scene,selectedId,account=false){this.account=account;const owned=this.economy.state.cosmetics||[];host.innerHTML=`<div class="style-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h3>Buddy style shop</h3><p>Little extras for your robot friends. Just for fun!</p></div><span class="style-local">BROWSER SAVE · COSMETIC ONLY</span></div><div class="style-options">${COSMETICS.map(c=>{const has=owned.includes(c.id);return `<article class="style-item"><span>${c.icon}</span><div><b>${c.name}</b><small>${has?'Owned':`${c.cost} scrap`}</small></div><button class="button button-secondary" data-style-buy="${c.id}" ${has||this.account||this.economy.state.scrap<c.cost?'disabled':''}>${has?'Owned':this.account?'Sign in mode':`Get it · ${c.cost} ▧`}</button></article>`;}).join('')}</div><label class="buddy-color">Buddy paint<select id="buddy-color" aria-label="Robot buddy paint">${COLORS.map(color=>`<option value="${color}" ${(this.economy.state.buddyColor||'mint')===color?'selected':''}>${color}</option>`).join('')}</select></label><small class="style-note">Paint and decorations never change robot speed or rewards.</small>`;
 host.onchange=e=>{if(e.target.id==='buddy-color'){this.economy.state.buddyColor=e.target.value;this.economy.persist();scene?.setBuddyStyle(this.economy.state.buddyColor,this.economy.state.cosmetics||[]);}};
 host.onclick=e=>{const button=e.target.closest('[data-style-buy]');if(!button||this.account)return;const item=COSMETICS.find(c=>c.id===button.dataset.styleBuy);if(!item||this.economy.state.scrap<item.cost)return;this.economy.state.scrap-=item.cost;this.economy.state.cosmetics=[...(this.economy.state.cosmetics||[]),item.id];this.economy.persist();scene?.setBuddyStyle(this.economy.state.buddyColor||'mint',this.economy.state.cosmetics);this.notify(`${item.name} unlocked for all your buddies!`);this.refresh();};
 scene?.setBuddyStyle(this.economy.state.buddyColor||'mint',owned);}
}
