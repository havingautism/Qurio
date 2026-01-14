# Retry Mechanism Test Guide

This guide explains how to test the retry mechanism for deep research steps.

## Prerequisites

1. Make sure the backend server is running

## Test Scenarios

### Scenario 1: Simple Retry (1 failure, then success)

**Test Config:**
```json
{
  "testConfig": {
    "enabled": true,
    "failAtStep": 0,
    "failAttempts": 1,
    "errorType": "network"
  }
}
```

**Expected Behavior:**
- Step 0 fails on first attempt
- System waits 1 second
- Step 0 retries and succeeds
- Total time: ~1 second longer than normal

---

### Scenario 2: Multiple Retries (2 failures, then success)

**Test Config:**
```json
{
  "testConfig": {
    "enabled": true,
    "failAtStep": 1,
    "failAttempts": 2,
    "errorType": "timeout"
  }
}
```

**Expected Behavior:**
- Step 1 fails on first attempt
- Waits 1 second, retries
- Step 1 fails again
- Waits 2 seconds, retries
- Step 1 succeeds on third attempt
- Total time: ~3 seconds longer than normal

---

### Scenario 3: Exceed Retry Limit (4 failures, should give up)

**Test Config:**
```json
{
  "testConfig": {
    "enabled": true,
    "failAtStep": 0,
    "failAttempts": 4,
    "errorType": "network"
  }
}
```

**Expected Behavior:**
- Step 0 fails 3 times with retries
- After 3rd retry (4th total attempt), gives up
- Step 0 marked as failed
- Research continues with remaining steps (if any)

---

### Scenario 4: Permanent Error (should not retry)

**Test Config:**
```json
{
  "testConfig": {
    "enabled": true,
    "failAtStep": 0,
    "failAttempts": 1,
    "errorType": "invalid_auth"
  }
}
```

**Expected Behavior:**
- Step 0 fails with auth error
- System immediately marks as failed
- No retries (permanent error)

---

## How to Test

### Method 1: Using cURL

```bash
curl -X POST http://localhost:3001/api/stream-deep-research \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "glm",
    "apiKey": "your-api-key",
    "model": "glm-4.5-air",
    "messages": [{"role": "user", "content": "What is quantum computing?"}],
    "question": "What is quantum computing?",
    "researchType": "general",
    "testConfig": {
      "enabled": true,
      "failAtStep": 0,
      "failAttempts": 1,
      "errorType": "network"
    }
  }'
```

### Method 2: Using Browser Console

Open your browser console and run:

```javascript
const response = await fetch('http://localhost:3001/api/stream-deep-research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'glm',
    apiKey: 'your-api-key',
    model: 'glm-4.5-air',
    messages: [{ role: 'user', content: 'What is quantum computing?' }],
    question: 'What is quantum computing?',
    researchType: 'general',
    testConfig: {
      enabled: true,
      failAtStep: 0,
      failAttempts: 1,
      errorType: 'network'
    }
  })
})

// Read the SSE stream
const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value)
  console.log(chunk)
}
```

### Method 3: Through the App UI

If you have implemented the test UI (recommended for development), you can use the test panel to trigger different scenarios.

---

## What to Look For

### Server Logs

Check the console for retry logs:

```
[DeepResearch] Step 0 error (attempt 1): network - ECONNRESET: Simulated network failure
[DeepResearch] Step 0 error (attempt 2): network - ECONNRESET: Simulated network failure
[DeepResearch] Step 0 succeeded on attempt 3
```

### SSE Events

Watch for `retrying` status events:

```javascript
{
  "type": "step",
  "stepIndex": 0,
  "totalSteps": 4,
  "status": "retrying",
  "attempt": 2,
  "maxAttempts": 3,
  "retryDelay": 2000,
  "message": "Network issue, retrying (2/3)..."
}
```

---

## Error Types

Available error types for testing:

| Type | Description | Retries | Max Attempts |
|------|-------------|---------|--------------|
| `network` | Simulates network error | ✅ Yes | 4 (initial + 3 retries) |
| `timeout` | Simulates timeout | ✅ Yes | 3 (initial + 2 retries) |
| `rate_limit` | Simulates API rate limit | ✅ Yes | 4 (initial + 3 retries) |
| `api_error` | Simulates API error | ✅ Yes | 3 (initial + 2 retries) |
| `invalid_auth` | Simulates auth error | ❌ No | 1 (no retries) |

---

## Troubleshooting

### Retries not triggering?

1. Check `ENABLE_TEST_MODE=true` in `.env`
2. Restart the backend server after changing `.env`
3. Verify `testConfig.enabled` is `true` in request

### Steps not failing as expected?

1. Check console logs for error classification
2. Verify `failAtStep` index is correct (0-based)
3. Check `failAttempts` value

---

## Production Deployment

**IMPORTANT:** Before deploying to production, make sure to:

1. Set `ENABLE_TEST_MODE=false` in production environment
2. Remove or disable any test UI components
3. Ensure `testConfig` is properly validated on the backend

The test mode should only work when:
- `ENABLE_TEST_MODE=true` in environment variables
- AND `testConfig.enabled=true` in request

This dual check prevents accidental test mode activation in production.
