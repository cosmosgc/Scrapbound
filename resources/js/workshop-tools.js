const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function enhanceResearch(host, nodes, signedIn) {
  const toolbar=document.createElement('div');toolbar.className='research-toolbar';
  const owned=nodes.filter(n=>n.owned).length,ready=nodes.filter(n=>n.available&&!n.owned).length;
  toolbar.innerHTML=`<div class="research-summary"><span class="research-mascot">✦</span><div><h3>Big ideas for little robots</h3><p>${signedIn?`${owned} of ${nodes.length} discoveries researched · ${ready} unlocked to explore`:'Explore what your factory could become. Sign in to save your research.'}</p><progress aria-label="Research completed" value="${owned}" max="${nodes.length}"></progress></div></div><div class="research-tools"><label>Find a discovery<input type="search" placeholder="Try mining, bots, alloy…" aria-label="Search technologies"></label><div class="research-switch" role="group" aria-label="Research view"><button type="button" data-layout="map" aria-pressed="true">Honeycomb tree</button><button type="button" data-layout="cards" aria-pressed="false">Discovery cards</button></div><label>Show<select aria-label="Filter technologies"><option value="all">All discoveries</option><option value="ready">Unlocked</option><option value="owned">Researched</option><option value="locked">Locked</option></select></label></div><p class="research-empty" hidden>No discoveries match. Try another search or filter.</p>`;
  host.prepend(toolbar);host.dataset.layout ||= 'map';
  toolbar.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===host.dataset.layout)));
  const query=toolbar.querySelector('input'),filter=toolbar.querySelector('select');
  query.value=host.dataset.query||'';filter.value=host.dataset.filter||'all';
  const apply=()=>{
    host.dataset.query=query.value;host.dataset.filter=filter.value;
    let visible=0;
    host.querySelectorAll('[data-tech-node]').forEach(card=>{
      const node=nodes.find(n=>n.id===card.dataset.techNode);
      const matches=`${node.name} ${node.description} ${JSON.stringify(node.effects || {})}`.toLowerCase().includes(query.value.trim().toLowerCase())&&(filter.value==='all'||filter.value==='owned'&&node.owned||filter.value==='ready'&&node.available&&!node.owned||filter.value==='locked'&&!node.available&&!node.owned);
      card.hidden=!matches;if(matches)visible++;
    });toolbar.querySelector('.research-empty').hidden=visible>0;
  };
  query.addEventListener('input',apply);filter.addEventListener('change',apply);apply();
  toolbar.querySelectorAll('[data-layout]').forEach(button=>button.addEventListener('click',()=>{
    host.dataset.layout=button.dataset.layout;
    toolbar.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
  if (!signedIn) {
    host.querySelectorAll('.technology-hex small').forEach(el => { el.textContent = 'DISCOVERY PREVIEW'; });
    host.querySelectorAll('.technology-tooltip-cost').forEach(el => { el.textContent = 'Sign in to research and save this discovery.'; });
  }
  // Use friendly prerequisite names while retaining immutable catalog IDs in data attributes.
  host.querySelectorAll('.technology-tooltip>small').forEach((element,index)=>{
    const node=nodes[index];element.textContent=node.prerequisites?.length?`Discover first: ${node.prerequisites.map(id=>nodes.find(n=>n.id===id)?.name||id).join(', ')}`:'Start here · no earlier discoveries needed';
  });
}
export function catalogToolbar(content, onlySection) {
  const sections=onlySection?[onlySection]:Object.keys(content);
  const count=sections.reduce((sum,key)=>sum+(Array.isArray(content[key])?content[key].length:0),0);
  return `<div class="studio-toolbar"><div><span class="eyebrow">CONTENT WORKBENCH</span><h3>${count} entries · ${sections.length} sections</h3><p>Edit → validate → create a draft → activate a version. Editing does not publish changes.</p></div><label>Find an entry<input type="search" data-studio-search placeholder="Name or ID…" aria-label="Search catalog entries"></label><div class="studio-actions"><button type="button" class="button button-secondary" data-studio-expand="true">Expand all</button><button type="button" class="button button-secondary" data-studio-expand="false">Collapse all</button></div></div><nav class="studio-section-nav" aria-label="Catalog sections">${sections.map(key=>`<button type="button" class="button button-secondary" data-studio-section="${escape(key)}">${escape(key.replace(/([a-z])([A-Z])/g,'$1 $2'))}<b>${Array.isArray(content[key])?content[key].length:'⚙'}</b></button>`).join('')}</nav><div class="studio-empty" hidden>No entries match your search.</div>`;
}
export function bindCatalogToolbar(host) {
  if (!host.querySelector) return;
  host.querySelector('[data-studio-search]')?.addEventListener('input',event=>{
    const query=event.target.value.trim().toLowerCase();let count=0;
    host.querySelectorAll('.structured-section').forEach(section=>{
      let found=false;
      section.querySelectorAll('.structured-entry').forEach(entry=>{
        const text=entry.querySelector('summary').textContent+' '+[...entry.querySelectorAll('input')].map(input=>input.value).join(' ');
        entry.hidden=!!query&&!text.toLowerCase().includes(query);if(!entry.hidden){found=true;count++;}
      });
      section.hidden=!!query&&!found&&!section.querySelector('summary').textContent.toLowerCase().includes(query);if(query&&!section.hidden)section.open=true;
    });host.querySelector('.studio-empty').hidden=!query||count>0;
  });
  host.querySelectorAll('[data-studio-expand]').forEach(button=>button.addEventListener('click',()=>host.querySelectorAll('details').forEach(details=>details.open=button.dataset.studioExpand==='true')));
  host.querySelectorAll('[data-studio-section]').forEach(button=>button.addEventListener('click',()=>{
    const section=[...host.querySelectorAll('[data-editor-section]')].find(s=>s.dataset.editorSection===button.dataset.studioSection);
    if(section){section.hidden=false;section.open=true;section.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  }));
}
