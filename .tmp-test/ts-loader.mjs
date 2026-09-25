/* Resolve hook for the smoke test: the lib/ files use extensionless
 * relative imports (fine under Next's bundler, invisible to Node ESM) —
 * retry failed resolves with ".ts" appended so --experimental-strip-types
 * can pick them up. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/i.test(specifier)) {
      return await nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
