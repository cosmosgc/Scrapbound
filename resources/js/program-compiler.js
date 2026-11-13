const MAX_INSTRUCTIONS = 40;
const MAX_CONDITION_DEPTH = 4;
const MAX_REPEAT_DEPTH = 4;

export function compileProgram(workspace) {
  const program = [];
  let invalidReason = '';

  const visit = (block, depth = 0, inCycle = false, repeatDepth = 0) => {
    let current = block;
    while (current && !invalidReason) {
      if (depth > MAX_CONDITION_DEPTH) { invalidReason = `Conditions can only be nested ${MAX_CONDITION_DEPTH} levels deep.`; return; }
      if (program.length >= MAX_INSTRUCTIONS) { invalidReason = `Programs are limited to ${MAX_INSTRUCTIONS} instructions.`; return; }

      if (current.type === 'sb_forever') {
        if (inCycle) { invalidReason = 'Repeat-cycle blocks cannot be nested.'; return; }
        visit(current.getInputTargetBlock('DO'), depth, true, repeatDepth);
      } else if (current.type === 'sb_repeat') {
        if (repeatDepth >= MAX_REPEAT_DEPTH) { invalidReason = `Repeat blocks can only be nested ${MAX_REPEAT_DEPTH} levels deep.`; return; }
        const repetitions = Math.max(1, Math.min(5, Math.round(Number(current.getFieldValue('TIMES')) || 1)));
        for (let iteration = 0; iteration < repetitions && !invalidReason; iteration++) {
          visit(current.getInputTargetBlock('DO'), depth, inCycle, repeatDepth + 1);
        }
      } else if (['sb_if_cargo', 'sb_if_full', 'sb_if_cargo_percent', 'sb_if_robot_type', 'sb_if_site', 'sb_if_drop'].includes(current.type)) {
        const conditionActions = {
          sb_if_cargo: 'if_cargo', sb_if_full: 'if_full', sb_if_cargo_percent: 'if_cargo_percent',
          sb_if_robot_type: 'if_robot_type', sb_if_site: 'if_site', sb_if_drop: 'if_drop',
        };
        const condition = {
          action: conditionActions[current.type],
          skip: 0,
          ...(['sb_if_site', 'sb_if_drop'].includes(current.type) ? { resource: current.getFieldValue('RESOURCE') || 'credits' } : {}),
          ...(current.type === 'sb_if_cargo_percent' ? { percent: Number(current.getFieldValue('PERCENT')) || 50 } : {}),
          ...(current.type === 'sb_if_robot_type' ? { kind: current.getFieldValue('KIND') || 'scavenger' } : {}),
        };
        const marker = program.length;
        program.push(condition);
        const bodyStart = program.length;
        visit(current.getInputTargetBlock('DO'), depth + 1, inCycle, repeatDepth);
        program[marker].skip = program.length - bodyStart;
      } else if (current.type === 'sb_patrol' || current.type === 'sb_scan') {
        program.push({ action: current.type === 'sb_patrol' ? 'patrol' : 'scan' });
      } else if (current.type === 'sb_seek_resource') {
        program.push({ action: 'seek', resource: current.getFieldValue('RESOURCE') || 'credits' });
      } else if (current.type === 'sb_collect') {
        program.push({ action: 'collect', resource: current.getFieldValue('RESOURCE') || 'credits' });
      } else if (current.type === 'sb_wait') {
        program.push({ action: 'wait', seconds: Number(current.getFieldValue('SECONDS')) || 1 });
      } else if (current.type === 'sb_move_to') {
        program.push({ action: 'move_to', x: Number(current.getFieldValue('X')) || 0, z: Number(current.getFieldValue('Z')) || 0 });
      } else if (current.type === 'sb_return_home') {
        program.push({ action: 'return_home' });
      } else if (current.type === 'sb_mine' || current.type === 'sb_collect_drops') {
        program.push({ action: current.type === 'sb_mine' ? 'mine' : 'collect_drops', resource: current.getFieldValue('RESOURCE') || (current.type === 'sb_mine' ? 'credits' : 'scrap') });
      } else if (current.type === 'sb_assist') {
        program.push({ action: 'assist', seconds: Number(current.getFieldValue('SECONDS')) || 10 });
      } else {
        invalidReason = `Unsupported Blockly block: ${current.type}.`;
        return;
      }

      current = current.getNextBlock();
    }
  };

  workspace.getTopBlocks(true).forEach(block => visit(block));
  return invalidReason ? { program: [], error: invalidReason } : { program, error: '' };
}
