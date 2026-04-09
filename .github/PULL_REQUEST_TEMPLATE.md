## Description

Please describe the changes you've made and why.

Fixes #(issue number, if applicable)

## Type of Change

Please select the relevant option:

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Database migration
- [ ] Dependency update
- [ ] Other (please specify)

## Related Issues

Link any related issues here:
- Closes #
- Related to #

## Changes Made

Please list the specific changes:

- [ ] Change 1
- [ ] Change 2
- [ ] Change 3

## Testing

How have you tested these changes?

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] Edge cases considered

### Test Coverage

Please describe what you tested:

```
What was tested:
- Feature X works as expected
- Edge case Y is handled
- Error case Z returns proper response
```

## Database Changes

If this PR includes database changes:

- [ ] New migration created in `supabase/migrations/`
- [ ] Migration is idempotent (safe to run multiple times)
- [ ] Rollback tested
- [ ] Migration includes comments for complex logic

Migration summary:
```sql
-- Describe the migration here
```

## Performance Impact

Are there any performance implications?

- [ ] No performance impact
- [ ] Improves performance (describe below)
- [ ] Potential performance impact (describe below)

If applicable, describe:

```
Performance notes:
- Added index on agents.slug for faster lookups
- Cached results now expire in 5 minutes
```

## Breaking Changes

Does this introduce any breaking changes?

- [ ] No breaking changes
- [ ] Yes, breaking changes (describe below)

If breaking changes, please describe the migration path for users:

```
Migration path:
1. Deprecate old endpoint in v1.1
2. Remove in v2.0
3. Users should update to use new endpoint
```

## API Changes

If this changes the API:

- [ ] New endpoint added
- [ ] Existing endpoint modified
- [ ] Endpoint deprecated
- [ ] OpenAPI spec updated

Please describe:

```
API Changes:
- POST /submit now requires X parameter
- GET /agents response includes new Y field
- Deprecated: GET /old-endpoint (use /new-endpoint instead)
```

## Checklist

- [ ] My code follows the style guide (see CONTRIBUTING.md)
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Screenshots (if applicable)

If this affects the UI, please include screenshots:

- Before:
- After:

## Deployment Notes

Any special deployment considerations?

- [ ] No special deployment needed
- [ ] Requires environment variable changes
- [ ] Requires database migration
- [ ] Requires cache invalidation
- [ ] Requires rollback plan

Deployment steps (if special):

```
1. Apply database migration
2. Deploy new code
3. Run cache invalidation script
4. Monitor error logs for issues
```

## Rollback Plan

If something goes wrong, how would we roll back?

```
1. Revert to previous commit
2. Run rollback migration
3. Clear application cache
4. Monitor error rates
```

## Questions or Concerns

Any questions or concerns for the reviewers?

---

Thank you for contributing! Please ensure your PR description is clear and all checks pass before requesting review.
