/**
 * A movie can legitimately reference the full actor catalogue. Keep the
 * request bounded, but comfortably above the current catalogue size so the
 * shared "select all" control and the API have the same contract.
 */
export const MAX_MOVIE_ACTORS = 500;
