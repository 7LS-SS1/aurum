import { describe, expect, it } from "vitest";
import * as schemas from "./validation";

describe("PATCH compatibility after the validator upgrade", () => {
  for (const [name, schema] of Object.entries(schemas)) {
    if (["updateMovieSchema", "updateSiteSchema", "updateComicSiteSchema", "updatePlayerConfigSchema", "updateWordpressThemeSchema", "updateWordpressPluginSchema", "updateActorSchema", "updateComicSeriesSchema", "updateComicSchema", "updateComicChapterSchema"].includes(name) && "parse" in schema) {
      it(`${name} does not synthesize omitted fields`, () => {
        expect(schema.parse({})).toEqual({});
      });
    }
  }
  it("preserves explicit clears and create defaults", () => {
    expect(schemas.updateMovieSchema.parse({ title: "Changed", tags: [] })).toEqual({ title: "Changed", tags: [] });
    expect(schemas.updatePlayerConfigSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(schemas.createMovieSchema.parse({ title: "New", mainCategory: "AV" })).toMatchObject({ tags: [], categories: [], actorIds: [], extraMeta: {} });
  });
});
