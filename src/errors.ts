/** A problem with the caller's input. Safe to show to the caller as-is. */
export class ReviewInputError extends Error {
  override name = "ReviewInputError";
}
