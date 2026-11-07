import * as Blockly from 'blockly';

const STORAGE_KEY = 'scrapbound.brain.v1';

Blockly.defineBlocksWithJsonArray([
  { type: 'sb_patrol', message0: 'patrol the workshop', previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Move through your assigned area.' },
  { type: 'sb_scan', message0: 'scan for salvage', previousStatement: null, nextStatement: null, colour: 196, tooltip: 'Look for useful materials.' },
  { type: 'sb_collect', message0: 'collect nearby scrap', previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Gather scrap from the work area.' },
  { type: 'sb_wait', message0: 'wait %1 seconds', args0: [{ type: 'field_number', name: 'SECONDS', value: 2, min: 1, max: 30 }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Pause before the next instruction.' },
  { type: 'sb_forever', message0: 'repeat forever %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Keep running the instructions inside.' },
]);

const toolbox = {
  kind: 'categoryToolbox', contents: [
    { kind: 'category', name: '🤖 Robot actions', colour: '148', contents: ['sb_patrol', 'sb_scan', 'sb_collect'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: '🔁 Control', colour: '275', contents: [{ kind: 'block', type: 'sb_forever' }, { kind: 'block', type: 'sb_wait' }] },
    { kind: 'category', name: '🧠 Logic', colour: '210', contents: [{ kind: 'block', type: 'controls_if' }, { kind: 'block', type: 'logic_compare' }, { kind: 'block', type: 'logic_boolean' }] },
    { kind: 'category', name: '🔢 Numbers', colour: '230', contents: [{ kind: 'block', type: 'math_number' }, { kind: 'block', type: 'math_arithmetic' }] },
  ],
};

export function createBrainWorkshop() {
  const workspace = Blockly.inject('blockly-workspace', {
    toolbox, trashcan: true, move: { scrollbars: true, drag: true, wheel: true },
    zoom: { controls: true, wheel: true, startScale: .9, maxScale: 1.3, minScale: .55 },
    grid: { spacing: 24, length: 3, colour: '#32352d', snap: true },
    theme: Blockly.Theme.defineTheme('scrapbound', {
      base: Blockly.Themes.Classic,
      componentStyles: { workspaceBackgroundColour: '#171914', toolboxBackgroundColour: '#20221c', toolboxForegroundColour: '#d8d8c9', flyoutBackgroundColour: '#24271f', flyoutForegroundColour: '#e8e9dc', flyoutOpacity: 1, scrollbarColour: '#55594a', insertionMarkerColour: '#bad77b', insertionMarkerOpacity: .3, cursorColour: '#f1c66f' },
    }),
  });
  window.addEventListener('resize', () => Blockly.svgResize(workspace));
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { Blockly.serialization.workspaces.load(JSON.parse(saved), workspace); }
    catch { loadTemplate(workspace); }
  } else loadTemplate(workspace);
  const nameInput = document.getElementById('brain-name-input');
  nameInput.value = localStorage.getItem('scrapbound.brain-name') || 'Salvage routine';
  document.getElementById('brain-name').textContent = nameInput.value;
  document.getElementById('save-brain').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
    localStorage.setItem('scrapbound.brain-name', nameInput.value.trim() || 'Untitled brain');
    document.getElementById('brain-name').textContent = nameInput.value.trim() || 'Untitled brain';
    document.dispatchEvent(new CustomEvent('scrapbound-toast', { detail: 'Brain saved in this browser.' }));
  });
  nameInput.addEventListener('input', () => { document.getElementById('brain-name').textContent = nameInput.value || 'Untitled brain'; });
  document.getElementById('load-template').addEventListener('click', () => {
    loadTemplate(workspace); nameInput.value = 'Salvage scout'; document.getElementById('brain-name').textContent = nameInput.value;
  });
  return workspace;
}

function loadTemplate(workspace) {
  const xml = Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml"><block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_patrol"><next><block type="sb_scan"><next><block type="sb_collect"/></next></block></next></block></statement></block></xml>`);
  workspace.clear(); Blockly.Xml.domToWorkspace(xml, workspace);
}
