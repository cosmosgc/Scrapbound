import * as Blockly from 'blockly';
import { compileProgram } from './program-compiler.js';
import './brains.css';

const STORAGE_KEY = 'scrapbound.brain.v1';
const CONTROL_STORAGE = 'scrapbound.controls.v1';

Blockly.defineBlocksWithJsonArray([
  { type: 'sb_patrol', message0: 'patrol the workshop', previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Move through your assigned area.' },
  { type: 'sb_seek_resource', message0: 'seek nearest %1 site', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['credits', 'credits'], ['scrap', 'scrap'], ['alloy', 'alloy']] }], previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Choose and drive to a matching live site, then continue with the next block.' },
  { type: 'sb_scan', message0: 'scan for salvage', previousStatement: null, nextStatement: null, colour: 196, tooltip: 'Look for useful materials.' },
  { type: 'sb_collect', message0: 'collect nearby %1', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['credits', 'credits'], ['scrap', 'scrap'], ['alloy', 'alloy']] }], previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Gather only this resource from the visited site.' },
  { type: 'sb_move_to', message0: 'move to field x %1 z %2', args0: [{ type: 'field_number', name: 'X', value: 0, min: -16, max: 16, precision: 0.5 }, { type: 'field_number', name: 'Z', value: 0, min: -10, max: 10, precision: 0.5 }], previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Move to a bounded coordinate in the salvage field.' },
  { type: 'sb_return_home', message0: 'return to base', previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Bring current cargo back to base; no cargo is created.' },
  { type: 'sb_mine', message0: 'mine nearest %1 block', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['credits', 'credits'], ['scrap', 'scrap'], ['alloy', 'alloy']] }], previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Break a matching voxel block. Its salvage appears as a visible drop in the factory.' },
  { type: 'sb_collect_drops', message0: 'collect nearest %1 drop', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['scrap', 'scrap'], ['credits', 'credits'], ['alloy', 'alloy']] }], previousStatement: null, nextStatement: null, colour: 38, tooltip: 'Drive to a mined salvage pile, load it, and return it to the depot.' },
  { type: 'sb_assist', message0: 'assist a nearby bot for %1 seconds', args0: [{ type: 'field_number', name: 'SECONDS', value: 10, min: 1, max: 30 }], previousStatement: null, nextStatement: null, colour: 148, tooltip: 'Follow a working teammate. Buffer bots boost nearby miners while they assist.' },
  { type: 'sb_if_cargo', message0: 'if carrying cargo do %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Run these steps only when this robot is carrying something.' },
  { type: 'sb_if_full', message0: 'if cargo hold is full do %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Branch using this robot type’s actual cargo capacity.' },
  { type: 'sb_if_cargo_percent', message0: 'if cargo is at least %1% full do %2', args0: [{ type: 'field_dropdown', name: 'PERCENT', options: [['25', '25'], ['50', '50'], ['75', '75'], ['100', '100']] }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Use a percentage of this robot type’s cargo capacity.' },
  { type: 'sb_if_robot_type', message0: 'if this robot is a %1 do %2', args0: [{ type: 'field_dropdown', name: 'KIND', options: [['scavenger', 'scavenger'], ['scrap hound', 'scrap_hound'], ['fabricator', 'fabricator'], ['sky miner', 'sky_miner'], ['block miner', 'block_miner'], ['cargo hauler', 'cargo_hauler'], ['buffer bot', 'buffer_bot']] }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Share one crew program while giving each robot role its own branch.' },
  { type: 'sb_if_site', message0: 'if %1 site is available do %2', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['credits', 'credits'], ['scrap', 'scrap'], ['alloy', 'alloy']] }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Run these steps only when a matching site has stock.' },
  { type: 'sb_if_drop', message0: 'if a %1 drop is waiting do %2', args0: [{ type: 'field_dropdown', name: 'RESOURCE', options: [['scrap', 'scrap'], ['credits', 'credits'], ['alloy', 'alloy']] }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Check visible salvage piles on the factory floor before choosing a task.' },
  { type: 'sb_wait', message0: 'wait %1 seconds', args0: [{ type: 'field_number', name: 'SECONDS', value: 2, min: 1, max: 30 }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Pause before the next instruction.' },
  { type: 'sb_repeat', message0: 'repeat %1 times %2', args0: [{ type: 'field_number', name: 'TIMES', value: 2, min: 1, max: 5, precision: 1 }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Repeat a short routine a fixed number of times. This is unrolled into a bounded program.' },
  { type: 'sb_forever', message0: 'repeat cycle %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 275, tooltip: 'Group a routine. Programs automatically return to the first step; there are no unbounded nested loops.' },
]);

const toolbox = {
  kind: 'categoryToolbox', contents: [
    { kind: 'category', name: '🤖 Robot actions', colour: '148', contents: ['sb_patrol', 'sb_seek_resource', 'sb_move_to', 'sb_scan', 'sb_collect', 'sb_mine', 'sb_collect_drops', 'sb_assist', 'sb_return_home'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: '🧠 Logic', colour: '210', contents: ['sb_if_cargo', 'sb_if_full', 'sb_if_cargo_percent', 'sb_if_robot_type', 'sb_if_site', 'sb_if_drop'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: '🔁 Control', colour: '275', contents: [{ kind: 'block', type: 'sb_forever' }, { kind: 'block', type: 'sb_repeat' }, { kind: 'block', type: 'sb_wait' }] },
  ],
};

export function createBrainWorkshop() {
  const presetPanel = document.createElement('div');
  presetPanel.className = 'panel brain-preset-panel';
  presetPanel.innerHTML = `<label for="brain-role-preset">Specialist brain preset</label><select id="brain-role-preset" aria-label="Specialist brain preset">${Object.entries(roleNames).map(([kind, name]) => `<option value="${kind}">${name} · ${({ scavenger: 'cache scout', scrap_hound: 'block breaker', fabricator: 'heavy extractor', sky_miner: 'alloy prospector', block_miner: 'rapid extractor', cargo_hauler: 'drop sweeper', buffer_bot: 'mining support' })[kind]}</option>`).join('')}</select><button id="load-role-brain" class="button button-secondary">Load specialist brain</button><span>Presets use mining, visible drops, cargo capacity, and team support already present in the factory simulation.</span>`;
  document.querySelector('.blockly-panel').before(presetPanel);
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
      document.getElementById('brain-status').textContent = 'Add at least one robot action before deploying.';
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
  document.getElementById('load-role-brain').addEventListener('click', () => {
    const kind = document.getElementById('brain-role-preset').value;
    deployTarget.value = `role:${kind}`;
    deployTarget.dispatchEvent(new Event('change'));
    loadRoleTemplate(workspace, kind);
    nameInput.value = `${roleNames[kind]} specialist`;
    document.getElementById('brain-name').textContent = nameInput.value;
    document.getElementById('brain-status').textContent = `${roleNames[kind]} specialist loaded. Deploy it to that robot role to use its role-tuned routine.`;
  });
  document.getElementById('brain-status').dataset.editorReady = 'true';
  document.getElementById('control-mode').dataset.controlsReady = 'true';
  return workspace;
}

function loadTemplate(workspace) {
  const xml = Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml"><block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_patrol"><next><block type="sb_scan"><next><block type="sb_collect"><field name="RESOURCE">credits</field></block></next></block></next></block></statement></block></xml>`);
  workspace.clear(); Blockly.Xml.domToWorkspace(xml, workspace);
}

const roleNames = {
  scavenger: 'Scavenger', scrap_hound: 'Scrap Hound', fabricator: 'Fabricator', sky_miner: 'Sky Miner',
  block_miner: 'Block Miner', cargo_hauler: 'Cargo Hauler', buffer_bot: 'Buffer Bot',
};

function loadRoleTemplate(workspace, kind) {
  const templates = {
    scavenger: '<block type="sb_if_drop" x="35" y="35"><field name="RESOURCE">scrap</field><statement name="DO"><block type="sb_collect_drops"/></statement><next><block type="sb_patrol"><next><block type="sb_scan"><next><block type="sb_collect"><field name="RESOURCE">credits</field></block></next></block></next></block></next></block>',
    scrap_hound: '<block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_mine"><field name="RESOURCE">scrap</field><next><block type="sb_collect_drops"><field name="RESOURCE">scrap</field></block></next></block></statement></block>',
    fabricator: '<block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_mine"><field name="RESOURCE">credits</field><next><block type="sb_collect_drops"><field name="RESOURCE">credits</field></block></next></block></statement></block>',
    sky_miner: '<block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_mine"><field name="RESOURCE">alloy</field><next><block type="sb_collect_drops"><field name="RESOURCE">alloy</field></block></next></block></statement></block>',
    block_miner: '<block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_mine"><field name="RESOURCE">scrap</field><next><block type="sb_collect_drops"><field name="RESOURCE">scrap</field></next></block></statement></block>',
    cargo_hauler: '<block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_if_drop"><field name="RESOURCE">scrap</field><statement name="DO"><block type="sb_collect_drops"><field name="RESOURCE">scrap</field></block></statement><next><block type="sb_if_drop"><field name="RESOURCE">credits</field><statement name="DO"><block type="sb_collect_drops"><field name="RESOURCE">credits</field></block></statement></block></next></block></statement></block>',
    buffer_bot: '<block type="sb_forever" x="35" y="35"><statement name="DO"><block type="sb_assist"><field name="SECONDS">12</field></block></statement></block>',
  };
  const xml = Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${templates[kind] || templates.scavenger}</xml>`);
  workspace.clear(); Blockly.Xml.domToWorkspace(xml, workspace);
}
