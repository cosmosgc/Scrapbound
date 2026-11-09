import * as Blockly from 'blockly';
import { compileProgram } from './program-compiler.js';

const STORAGE_KEY = 'scrapbound.brain.v1';
const CONTROL_STORAGE = 'scrapbound.controls.v1';

Blockly.defineBlocksWithJsonArray([
  { type: 'sb_patrol', message0: 'patrol the workshop', previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Move through your assigned area.' },
  { type: 'sb_scan', message0: 'scan for salvage', previousStatement: null, nextStatement: null, colour: 196, tooltip: 'Look for useful materials.' },
  { type: 'sb_collect', message0: 'collect nearby %1', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['credits', 'credits'], ['scrap', 'scrap'], ['alloy', 'alloy']] }], previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Gather only this resource from the visited site.' },
  { type: 'sb_move_to', message0: 'move to field x %1 z %2', args0: [{ type: 'field_number', name: 'X', value: 0, min: -16, max: 16, precision: 0.5 }, { type: 'field_number', name: 'Z', value: 0, min: -10, max: 10, precision: 0.5 }], previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Move to a bounded coordinate in the salvage field.' },
  { type: 'sb_return_home', message0: 'return to base', previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Bring current cargo back to base; no cargo is created.' },
  { type: 'sb_if_cargo', message0: 'if carrying cargo do %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Run these steps only when this robot is carrying something.' },
  { type: 'sb_if_site', message0: 'if %1 site is available do %2', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['credits', 'credits'], ['scrap', 'scrap'], ['alloy', 'alloy']] }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Run these steps only when a matching site has stock.' },
  { type: 'sb_wait', message0: 'wait %1 seconds', args0: [{ type: 'field_number', name: 'SECONDS', value: 2, min: 1, max: 30 }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Pause before the next instruction.' },
  { type: 'sb_forever', message0: 'repeat cycle %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Group a routine. Programs automatically return to the first step; there are no unbounded nested loops.' },
]);

const toolbox = {
  kind: 'categoryToolbox', contents: [
    { kind: 'category', name: '🤖 Robot actions', colour: '148', contents: ['sb_patrol', 'sb_move_to', 'sb_scan', 'sb_collect', 'sb_return_home'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: '🧠 Logic', colour: '210', contents: [{ kind: 'block', type: 'sb_if_cargo' }, { kind: 'block', type: 'sb_if_site' }] },
    { kind: 'category', name: '🔁 Control', colour: '275', contents: [{ kind: 'block', type: 'sb_forever' }, { kind: 'block', type: 'sb_wait' }] },
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
  let controlState;
  try { controlState = JSON.parse(localStorage.getItem(CONTROL_STORAGE)); } catch { controlState = null; }
  controlState ||= { profiles: { Default: { mode: 'program', bindings: { up: 'w', left: 'a', down: 's', right: 'd' } } }, assignments: {} };
  const persistControls = () => {
    localStorage.setItem(CONTROL_STORAGE, JSON.stringify(controlState));
    document.dispatchEvent(new CustomEvent('scrapbound-control-config', { detail: controlState }));
    renderControlEditor();
  };
  const renderControlEditor = () => {
    const profileSelect = document.getElementById('control-profile');
    const selected = profileSelect.value || 'Default';
    profileSelect.innerHTML = Object.keys(controlState.profiles).map(profile => `<option value="${profile.replace(/[&<>"']/g, '')}">${profile.replace(/[&<>"']/g, '')}</option>`).join('');
    profileSelect.value = controlState.profiles[selected] ? selected : 'Default';
    const config = controlState.profiles[profileSelect.value] || controlState.profiles.Default;
    document.getElementById('control-mode').value = config.mode || 'program';
    document.getElementById('control-target').value = String(controlTargetValue());
    document.querySelectorAll('[data-bind]').forEach(button => {
      button.textContent = `${({ up: '↑', left: '←', down: '↓', right: '→' })[button.dataset.bind]} ${String(config.bindings?.[button.dataset.bind] || '').toUpperCase()}`;
    });
    document.getElementById('keybinds').classList.toggle('hidden', config.mode !== 'keyboard');
    document.getElementById('control-status').textContent = `Unit ${String(Number(document.getElementById('control-target').value) + 1).padStart(2, '0')} uses “${profileSelect.value}” · ${config.mode || 'program'} mode.`;
  };
  const controlTargetValue = () => document.getElementById('control-target').value || 0;
  document.getElementById('control-target').addEventListener('change', renderControlEditor);
  document.getElementById('control-profile').addEventListener('change', renderControlEditor);
  document.getElementById('control-mode').addEventListener('change', event => {
    controlState.profiles[document.getElementById('control-profile').value].mode = event.target.value;
    persistControls();
  });
  document.getElementById('control-assign-profile').addEventListener('click', () => {
    controlState.assignments[controlTargetValue()] = document.getElementById('control-profile').value;
    persistControls();
    document.getElementById('control-status').textContent = `Switched unit ${String(Number(controlTargetValue()) + 1).padStart(2, '0')} to “${document.getElementById('control-profile').value}”.`;
  });
  document.getElementById('control-new-profile').addEventListener('click', () => {
    const name = window.prompt('Name this bot configuration (e.g. Scout, Driver):');
    if (!name?.trim()) return;
    const safeName = name.trim().slice(0, 24);
    controlState.profiles[safeName] = structuredClone(controlState.profiles[document.getElementById('control-profile').value] || controlState.profiles.Default);
    document.getElementById('control-profile').value = safeName;
    persistControls();
  });
  document.querySelectorAll('[data-bind]').forEach(button => button.addEventListener('click', () => {
    button.dataset.capturing = 'true'; button.textContent = 'Press key…';
    document.getElementById('control-status').textContent = 'Press a keyboard key to bind this direction.';
  }));
  document.addEventListener('keydown', event => {
    const button = document.querySelector('[data-bind][data-capturing="true"]');
    if (!button || event.key.length !== 1) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const config = controlState.profiles[document.getElementById('control-profile').value];
    config.bindings ||= {};
    config.bindings[button.dataset.bind] = event.key.toLowerCase();
    delete button.dataset.capturing;
    persistControls();
  }, true);
  renderControlEditor();
  localStorage.setItem(CONTROL_STORAGE, JSON.stringify(controlState));
  document.dispatchEvent(new CustomEvent('scrapbound-control-config', { detail: controlState }));
  nameInput.value = localStorage.getItem('scrapbound.brain-name') || 'Salvage routine';
  document.getElementById('brain-name').textContent = nameInput.value;
  document.getElementById('save-brain').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
    localStorage.setItem('scrapbound.brain-name', nameInput.value.trim() || 'Untitled brain');
    document.getElementById('brain-name').textContent = nameInput.value.trim() || 'Untitled brain';
    document.dispatchEvent(new CustomEvent('scrapbound-toast', { detail: 'Brain saved in this browser.' }));
  });
  const deployTarget = document.getElementById('brain-deploy-target');
  let editorTarget = deployTarget.value || 'all';
  const draftKey = target => `scrapbound.brain-draft.v1:${target}`;
  deployTarget.addEventListener('change', () => {
    localStorage.setItem(draftKey(editorTarget), JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
    editorTarget = deployTarget.value;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey(editorTarget)) || 'null');
      if (draft) Blockly.serialization.workspaces.load(draft, workspace);
      else loadTemplate(workspace);
    } catch { loadTemplate(workspace); }
    nameInput.value = editorTarget.startsWith('role:') ? `${editorTarget.slice(5).replaceAll('_', ' ')} brain` : 'Robot routine';
    document.getElementById('brain-name').textContent = nameInput.value;
  });
  try {
    const initialDraft = JSON.parse(localStorage.getItem(draftKey(editorTarget)) || 'null');
    if (initialDraft) Blockly.serialization.workspaces.load(initialDraft, workspace);
  } catch {}
  workspace.addChangeListener(event => {
    if (!event.isUiEvent) localStorage.setItem(draftKey(editorTarget), JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
  });
  document.getElementById('deploy-brain').addEventListener('click', () => {
    const compiled = compileProgram(workspace);
    if (compiled.error) {
      document.getElementById('brain-status').textContent = compiled.error;
      return;
    }
    const program = compiled.program;
    if (!program.length) {
      document.getElementById('brain-status').textContent = 'Add patrol, scan, and collect actions before deploying.';
      return;
    }
    const target = document.getElementById('brain-deploy-target').value;
    const targetId = target === 'all' ? null : target.startsWith('role:') ? target : Number(target.slice('unit:'.length));
    document.dispatchEvent(new CustomEvent('scrapbound-deploy-program', { detail: { program, targetId } }));
    const assignment = targetId === null ? 'the whole crew' : typeof targetId === 'string' ? `the ${targetId.slice(5)} role` : `unit ${String(targetId + 1).padStart(2, '0')}`;
    document.getElementById('brain-status').textContent = `Deployed ${program.length} instruction${program.length === 1 ? '' : 's'} to ${assignment}. Watch the factory to see it run.`;
  });
  nameInput.addEventListener('input', () => { document.getElementById('brain-name').textContent = nameInput.value || 'Untitled brain'; });
  document.getElementById('load-template').addEventListener('click', () => {
    loadTemplate(workspace); nameInput.value = 'Salvage scout'; document.getElementById('brain-name').textContent = nameInput.value;
  });
  return workspace;
}

function loadTemplate(workspace) {
  const xml = Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml"><block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_patrol"><next><block type="sb_scan"><next><block type="sb_collect"><field name="RESOURCE">credits</field></block></next></block></next></block></statement></block></xml>`);
  workspace.clear(); Blockly.Xml.domToWorkspace(xml, workspace);
}
