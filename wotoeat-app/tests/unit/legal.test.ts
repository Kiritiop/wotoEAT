import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGAL_SLUGS, LEGAL_BY_LANG, legalDoc } from "../../constants/legal";

// A legal document that exists in one language and not the other, or that
// quietly loses a clause in translation, is the failure mode worth catching:
// the app renders whichever the user's language selects, so a missing section
// means a user never sees a term that applies to them.
test("every document exists in both languages with matching sections", () => {
  for (const slug of LEGAL_SLUGS) {
    const en = LEGAL_BY_LANG.en[slug];
    const zh = LEGAL_BY_LANG.zh[slug];
    assert.ok(en, `missing en doc: ${slug}`);
    assert.ok(zh, `missing zh doc: ${slug}`);
    assert.equal(en.titleKey, zh.titleKey, `${slug}: title key differs`);
    assert.equal(
      en.sections.length,
      zh.sections.length,
      `${slug}: en has ${en.sections.length} sections, zh has ${zh.sections.length}`,
    );
  }
});

test("no document is empty and every section has a heading and body", () => {
  for (const lang of ["en", "zh"] as const) {
    for (const slug of LEGAL_SLUGS) {
      const doc = LEGAL_BY_LANG[lang][slug];
      assert.ok(doc.sections.length > 0, `${lang}/${slug}: no sections`);
      for (const [heading, body] of doc.sections) {
        assert.ok(heading.trim().length > 0, `${lang}/${slug}: blank heading`);
        assert.ok(body.trim().length > 0, `${lang}/${slug}: blank body under "${heading}"`);
      }
    }
  }
});

// The screen renders legalDoc(slug, language) and shows legal_not_found when it
// returns undefined, so an unknown slug must not throw.
test("an unknown slug resolves to undefined rather than throwing", () => {
  assert.equal(legalDoc("nope" as never, "en"), undefined);
  assert.equal(legalDoc("nope" as never, "zh"), undefined);
});

test("unknown languages fall back to English", () => {
  assert.equal(legalDoc("privacy", "fr"), LEGAL_BY_LANG.en.privacy);
});
