// tokens.ts — Map libmsl lexer kinds to LSP semantic token types.
// ──────────────────────────────────────────────────────────────────────────────
// The LSP semantic-tokens protocol expects two ordered arrays (a "legend") the
// client uses to decode the numeric token stream the server publishes. Both
// arrays are declared here so the legend and the classifier stay in sync.
// ──────────────────────────────────────────────────────────────────────────────

import { LexKind } from './msl';

export const SEMANTIC_TOKEN_TYPES = [
  'type',       //  0 — built-in MSL type keywords (float4, texture2d, ...)
  'keyword',    //  1 — control flow, qualifiers, storage classes
  'function',   //  2 — user-defined or libmsl builtin functions
  'variable',   //  3 — local variables / unclassified identifiers
  'number',     //  4
  'string',     //  5
  'operator',   //  6
  'comment',    //  7
  'macro',      //  8 — preprocessor directives (#include, #define, ...)
  'struct',     //  9 — user struct / class declaration or use
  'parameter',  // 10 — function parameter
  'property',   // 11 — struct field
] as const;

export const SEMANTIC_TOKEN_MODIFIERS = [
  'defaultLibrary',  // 0 — applied to libmsl built-in functions
  'declaration',     // 1 — (reserved for phase 2)
] as const;

const MOD_DEFAULT_LIBRARY = 1 << 0;

export interface SemanticClass {
  typeIndex: number;
  modifiers: number; // bitmask over SEMANTIC_TOKEN_MODIFIERS
}

/** Classify one libmsl token. Returns null when the token should be left to
 *  the TextMate grammar (punctuation, `[[ ]]` brackets, unclassified). */
export function classify(kind: number): SemanticClass | null {
  switch (kind) {
    case LexKind.TYPE:          return { typeIndex: 0, modifiers: 0 };
    case LexKind.KEYWORD:       return { typeIndex: 1, modifiers: 0 };
    case LexKind.BUILTIN_FUNC:  return { typeIndex: 2, modifiers: MOD_DEFAULT_LIBRARY };
    case LexKind.FUNCTION:      return { typeIndex: 2, modifiers: 0 };
    case LexKind.IDENTIFIER:    return { typeIndex: 3, modifiers: 0 };
    case LexKind.VARIABLE:      return { typeIndex: 3, modifiers: 0 };
    case LexKind.NUMBER:        return { typeIndex: 4, modifiers: 0 };
    case LexKind.STRING:
    case LexKind.CHAR:          return { typeIndex: 5, modifiers: 0 };
    case LexKind.OPERATOR:      return { typeIndex: 6, modifiers: 0 };
    case LexKind.COMMENT:       return { typeIndex: 7, modifiers: 0 };
    case LexKind.PREPROCESSOR:  return { typeIndex: 8, modifiers: 0 };
    case LexKind.STRUCT_NAME:   return { typeIndex: 9, modifiers: 0 };
    case LexKind.PARAMETER:     return { typeIndex: 10, modifiers: 0 };
    case LexKind.FIELD:         return { typeIndex: 11, modifiers: 0 };
    default:                    return null;
  }
}
