import { Text as RNText, TextInput as RNTextInput, StyleSheet } from "react-native";

/**
 * Brand typography — Nunito (rounded, friendly).
 *
 * React Native loads each font weight as a separate family, so a global font
 * swap must map `fontWeight` → the matching Nunito family or the whole app
 * loses its bold/heading hierarchy. This module patches Text / TextInput once
 * (after the fonts load) to do exactly that, preserving every existing
 * `fontWeight` in the styles untouched.
 */
const FAMILY_BY_WEIGHT: Record<string, string> = {
  "100": "Nunito_400Regular",
  "200": "Nunito_400Regular",
  "300": "Nunito_400Regular",
  "400": "Nunito_400Regular",
  normal: "Nunito_400Regular",
  "500": "Nunito_500Medium",
  "600": "Nunito_600SemiBold",
  "700": "Nunito_700Bold",
  bold: "Nunito_700Bold",
  "800": "Nunito_800ExtraBold",
  "900": "Nunito_900Black",
};

let applied = false;

/** Patch Text/TextInput to render Nunito at the right weight. Idempotent. */
export function applyBrandFont() {
  if (applied) return;
  applied = true;
  patch(RNText as any);
  patch(RNTextInput as any);
}

function patch(Comp: any) {
  const orig = Comp.render;
  if (typeof orig !== "function") return; // web / unexpected shape — skip safely
  Comp.render = function (props: any, ref: any) {
    const flat = StyleSheet.flatten(props.style) || {};
    // Respect an explicitly-set fontFamily (e.g. icon fonts) — never override it.
    if (flat.fontFamily) return orig.call(this, props, ref);
    const weight = String(flat.fontWeight ?? "400");
    const family = FAMILY_BY_WEIGHT[weight] ?? "Nunito_400Regular";
    // fontFamily first (lowest priority), caller style next, then strip
    // fontWeight last so the OS doesn't synthetically bold an already-bold face.
    const style = [{ fontFamily: family }, props.style, { fontWeight: "normal" as const }];
    return orig.call(this, { ...props, style }, ref);
  };
}
