# Unreleased

# v0.1.4
- [changed] Network streams are automatically closed after 60 seconds of
  idleness.
- [changed] We no longer log 'RPC failed' messages for expected failures.

# v0.1.2
- [changed] We now support `FieldValue.delete()` sentinels in `set()` calls
  with `{merge:true}`.
- [fixed] Fixed validation of nested arrays to allow indirect nesting

# v0.1.1
- [fixed] Fixed an issue causing exceptions when trying to use
  `firebase.firestore.FieldPath.documentId()` in an `orderBy()` or `where()`
  clause in a query.

# v0.1.0
- Initial public release.
