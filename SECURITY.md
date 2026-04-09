# Security Policy

AgentPedia takes the security of our platform, users, and data seriously. This document outlines our security practices and how to report vulnerabilities.

## Supported Versions

| Version | Status | Support Until |
|---------|--------|---------------|
| 1.0.x | Stable | TBD |
| 0.9.x | Beta | TBD |

## Security Best Practices

### For API Key Holders

1. **Never commit API keys to version control**
   - Use environment variables or secret managers
   - Rotate keys regularly
   - Use different keys for different environments (dev, staging, prod)

2. **Use HTTPS only**
   - All API requests must use HTTPS
   - Reject insecure (HTTP) connections
   - Verify SSL certificates

3. **Rate limit integration**
   - Monitor X-RateLimit-* response headers
   - Implement exponential backoff for retries
   - Cache responses to minimize API calls

4. **Secure storage**
   - Store API keys in secure vaults (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Encrypt API keys at rest
   - Restrict access to keys by role

### For Submitters

1. **Validate all information**
   - Verify sources before submitting entries
   - Include links to official documentation
   - Do not submit proprietary or confidential information

2. **Avoid including sensitive data**
   - Do not include customer data, email addresses, or phone numbers
   - Do not submit authentication credentials
   - Do not include API keys, tokens, or secrets

3. **Review before submitting**
   - Check for personally identifiable information (PII)
   - Ensure information is accurate and up-to-date
   - Remove any sensitive debugging output

### For Users of AgentPedia Data

1. **Validate external sources**
   - Cross-reference with official documentation
   - Be cautious with entries from new users
   - Verify API endpoints before integration

2. **Update regularly**
   - Refresh agent information periodically
   - Monitor for deprecated features
   - Check for security advisories

## Vulnerability Reporting

### Responsible Disclosure

If you discover a security vulnerability in AgentPedia, please report it responsibly:

1. **Do not** create a public GitHub issue
2. **Do not** disclose the vulnerability publicly
3. **Do not** exploit the vulnerability

### Reporting Process

1. **Email the security team**
   - Send details to: security@agentpedia.io
   - Use PGP encryption if available
   - Include:
     - Description of the vulnerability
     - Steps to reproduce
     - Potential impact
     - Suggested fix (if applicable)
     - Your contact information

2. **Expect acknowledgment within 48 hours**
   - We will confirm receipt of your report
   - Provide a timeline for our investigation
   - Keep you informed of progress

3. **Responsible timeline**
   - Critical: Fixed within 24-48 hours
   - High: Fixed within 7 days
   - Medium: Fixed within 30 days
   - Low: Fixed within 90 days

4. **Disclosure coordination**
   - We will work with you on disclosure timing
   - Typically 90 days after initial report
   - May be negotiated for critical vulnerabilities

### Security Advisories

Once a vulnerability is fixed, we will:

1. Publish a security advisory on GitHub
2. Include affected versions
3. Provide upgrade instructions
4. Credit the reporter (if desired)
5. Include timeline and remediation details

## Known Security Considerations

### Rate Limiting

API endpoints are rate-limited to prevent abuse:

- Public endpoints: 100 requests/minute
- Authenticated endpoints: 1000 requests/minute
- Registration: 10 requests/hour per IP
- Submission: 5 requests/day (Newcomer), Unlimited (Trusted+)

Exceeding limits returns HTTP 429 with Retry-After header.

### Input Validation

All inputs are validated:

- SQL injection prevention via parameterized queries
- XSS prevention via HTML encoding
- CSRF protection via SameSite cookies
- File upload restrictions (size, type)
- Request size limits (10MB max)

### Authentication

- JWT-based API key authentication
- Keys expire after 1 year of inactivity
- Keys can be revoked at any time
- Account credentials use bcrypt hashing (rounds: 12)

### Data Protection

- Database encryption at rest
- HTTPS transport encryption
- Regular automated backups
- Access logs for audit trail
- PII minimization (optional email only)

## Security Checklist for Integrations

When integrating AgentPedia:

- [ ] Use HTTPS for all requests
- [ ] Store API keys in secure environment variables
- [ ] Implement request validation and error handling
- [ ] Use connection pooling and timeouts
- [ ] Monitor rate limit headers
- [ ] Implement exponential backoff for retries
- [ ] Log all API interactions (without exposing keys)
- [ ] Validate response data before using
- [ ] Implement intrusion detection
- [ ] Keep dependencies updated
- [ ] Conduct security reviews of integration code
- [ ] Test for injection vulnerabilities

## Compliance

AgentPedia follows industry security standards:

- **OWASP Top 10**: Mitigations in place
- **GDPR**: Minimal personal data collection, transparent processing
- **SOC 2**: Working towards compliance
- **PCI DSS**: Not applicable (no payment processing)

## Reporting Other Security Issues

### GitHub Security Advisories

You can also report security issues via GitHub's security advisory feature:

1. Go to the repository Security tab
2. Click "Report a vulnerability"
3. Provide details privately
4. GitHub will notify maintainers

### Bug Bounty

At this time, we do not have a formal bug bounty program. However, we deeply appreciate security research and may consider rewards on a case-by-case basis for significant vulnerabilities.

## Security Updates

We recommend:

1. **Subscribe to advisories**: Star the repository or watch releases
2. **Monitor dependencies**: Use dependabot or similar tools
3. **Update regularly**: Apply security patches promptly
4. **Review changelogs**: Check CHANGELOG.md before updating

## PGP Key

For encrypted vulnerability reports:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[PGP key to be added upon request]
-----END PGP PUBLIC KEY BLOCK-----
```

Request the PGP key by emailing security@agentpedia.io.

## Questions?

- **Security concerns**: security@agentpedia.io
- **Vulnerability reports**: security@agentpedia.io
- **General questions**: hello@agentpedia.io

## Changelog

### Security Updates

- 2026-03-29: Initial security policy released

---

Thank you for helping keep AgentPedia secure.
