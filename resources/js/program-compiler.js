const MAX_INSTRUCTIONS = 40;
const MAX_CONDITION_DEPTH = 4;

export function compileProgram(workspace) {
  const program = [];
  let invalidReason = '';

  const visit = (block, depth = 0, inCycle = false) => {
    let current = block;
    while (current && !invalidReason) {
      if (depth > MAX_CONDITION_DEPTH) { invalidReason = `Conditions can only be nested ${MAX_CONDITION_DEPTH} levels deep.`; return; }
      if (program.length >= MAX_INSTRUCTIONS) { invalidReason = `Programs are limited to ${MAX_INSTRUCTIONS} instructions.`; return; }

      if (current.type === 'sb_forever') {
        if (inCycle) { invalidReason = 'Repeat-cycle blocks cannot be nested.'; return; }
        visit(current.getInputTargetBlock('DO'), depth, true);
      } else if (current.type === 'sb_if_cargo' || current.type === 'sb_if_site') {
        const condition = current.type === 'sb_if_cargo'
          ? { action: 'if_cargo', skip: 0 }
          : { action: 'if_site', resource: current.getFieldValue('RESOURCE') || 'credits', skip: 0 };
        const marker = program.length;
        program.push(condition);
        const bodyStart = program.length;
        visit(current.getInputTargetBlock('DO'), depth + 1, inCycle);
        program[marker].skip = program.length - bodyStart;
      } else if (current.type === 'sb_patrol' || current.type === 'sb_scan') {
        program.push({ action: current.type === 'sb_patrol' ? 'patrol' : 'scan' });
      } else if (current.type === 'sb_collect') {
        program.push({ action: 'collect', resource: current.getFieldValue('RESOURCE') || 'credits' });
      } else if (current.type === 'sb_wait') {
        program.push({ action: 'wait', seconds: Number(current.getFieldValue('SECONDS')) || 1 });
      } else if (current.type === 'sb_move_to') {
        program.push({ action: 'move_to', x: Number(current.getFieldValue('X')) || 0, z: Number(current.getFieldValue('Z')) || 0 });
      } else if (current.type === 'sb_return_home') {
        program.push({ action: 'return_home' });
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
