/** A thrown error's message for a toast or alert. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    // Validation errors arrive as a JSON list of issues.
    try {
      const issues = JSON.parse(error.message);
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // Not JSON: the message itself.
    }
    return error.message;
  }
  return "That didn't work. Try again.";
}
