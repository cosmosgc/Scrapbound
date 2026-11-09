<?php

namespace App\Services;

use InvalidArgumentException;

class RobotProgramValidator
{
    public const MAX_INSTRUCTIONS = 40;

    public function validateProgram(mixed $program): array
    {
        if (! is_array($program) || ! array_is_list($program) || count($program) > self::MAX_INSTRUCTIONS) {
            throw new InvalidArgumentException('Programs must be lists of at most 40 instructions.');
        }

        foreach ($program as $index => $step) {
            if (! is_array($step) || ! is_string($step['action'] ?? null)) {
                throw new InvalidArgumentException('Every instruction needs a supported action.');
            }
            $action = $step['action'];
            $allowed = match ($action) {
                'patrol', 'scan', 'return_home' => ['action'],
                'collect' => ['action', 'resource'],
                'wait' => ['action', 'seconds'],
                'move_to' => ['action', 'x', 'z'],
                'if_cargo' => ['action', 'skip'],
                'if_site' => ['action', 'resource', 'skip'],
                default => throw new InvalidArgumentException('Unsupported robot instruction.'),
            };
            if (array_diff(array_keys($step), $allowed)) {
                throw new InvalidArgumentException('Instruction contains unsupported fields.');
            }
            if (in_array($action, ['collect', 'if_site'], true) && ! in_array($step['resource'] ?? 'credits', ['credits', 'scrap', 'alloy'], true)) {
                throw new InvalidArgumentException('Resource must be a supported salvage type.');
            }
            if ($action === 'wait' && (! is_numeric($step['seconds'] ?? null) || $step['seconds'] < 1 || $step['seconds'] > 30)) {
                throw new InvalidArgumentException('Wait duration must be between 1 and 30 seconds.');
            }
            if ($action === 'move_to' && (! is_numeric($step['x'] ?? null) || ! is_numeric($step['z'] ?? null) || $step['x'] < -16 || $step['x'] > 16 || $step['z'] < -10 || $step['z'] > 10)) {
                throw new InvalidArgumentException('Movement destination is outside salvage field bounds.');
            }
            if (in_array($action, ['if_cargo', 'if_site'], true)) {
                $skip = $step['skip'] ?? null;
                if (! is_int($skip) || $skip < 0 || $skip > self::MAX_INSTRUCTIONS || $index + 1 + $skip > count($program)) {
                    throw new InvalidArgumentException('Conditional jump must remain inside the program.');
                }
            }
        }

        foreach ($program as $index => $step) {
            if (! in_array($step['action'] ?? null, ['if_cargo', 'if_site'], true)) {
                continue;
            }
            $depth = 1;
            foreach ($program as $parentIndex => $parent) {
                if ($parentIndex >= $index || ! in_array($parent['action'] ?? null, ['if_cargo', 'if_site'], true)) {
                    continue;
                }
                if ($parentIndex + 1 + $parent['skip'] > $index) {
                    $depth++;
                }
            }
            if ($depth > 4) {
                throw new InvalidArgumentException('Conditional nesting cannot exceed four levels.');
            }
        }

        return $program;
    }

    public function validateAssignments(mixed $assignments, int $crewSize): array
    {
        if (! is_array($assignments) || array_diff(array_keys($assignments), ['crew', 'units'])) {
            throw new InvalidArgumentException('Program assignments are malformed.');
        }
        $normalized = ['crew' => [], 'units' => []];
        if (isset($assignments['crew'])) {
            $normalized['crew'] = $this->validateProgram($assignments['crew']);
        }
        $units = $assignments['units'] ?? [];
        if (! is_array($units) || count($units) > 20) {
            throw new InvalidArgumentException('Per-unit assignments are malformed.');
        }
        foreach ($units as $unitId => $program) {
            if (! ctype_digit((string) $unitId) || (int) $unitId >= $crewSize) {
                throw new InvalidArgumentException('Per-unit program references an unowned robot.');
            }
            $normalized['units'][(int) $unitId] = $this->validateProgram($program);
        }

        return $normalized;
    }
}
