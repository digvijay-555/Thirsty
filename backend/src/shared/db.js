/**
 * WaterSaathi - Database Client Layer
 * 
 * Supports both Amazon DynamoDB DocumentClient and a high-fidelity in-memory
 * database for offline testing, local mock server, and CI without AWS credentials.
 */

// In-Memory store for offline / local mode
const inMemoryStore = {
  tankers: new Map(),
  requests: new Map(),
  bookings: new Map(),
  reports: new Map(),
};

// Map table environment variable names or default names to inMemoryStore keys
function getStoreKeyForTable(tableName = '') {
  const lower = tableName.toLowerCase();
  if (lower.includes('tanker')) return 'tankers';
  if (lower.includes('request')) return 'requests';
  if (lower.includes('booking')) return 'bookings';
  if (lower.includes('report')) return 'reports';
  return 'tankers';
}

function getPrimaryKeyField(storeKey) {
  switch (storeKey) {
    case 'tankers': return 'tankerId';
    case 'requests': return 'requestId';
    case 'bookings': return 'bookingId';
    case 'reports': return 'reportId';
    default: return 'id';
  }
}

class InMemoryDbClient {
  async get(tableName, key) {
    const storeKey = getStoreKeyForTable(tableName);
    const table = inMemoryStore[storeKey];
    const pk = Object.values(key)[0];
    const item = table.get(pk);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async put(tableName, item, conditionExpression = null) {
    const storeKey = getStoreKeyForTable(tableName);
    const table = inMemoryStore[storeKey];
    const pkField = getPrimaryKeyField(storeKey);
    const pk = item[pkField];

    if (conditionExpression) {
      const existing = table.get(pk);
      // Evaluate basic conditions if specified
      if (conditionExpression.includes('attribute_not_exists') && existing) {
        const error = new Error('The conditional request failed (item already exists).');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
    }

    table.set(pk, JSON.parse(JSON.stringify(item)));
    return item;
  }

  async update(tableName, key, updateExpression, expressionAttributeNames = {}, expressionAttributeValues = {}, conditionExpression = null) {
    const storeKey = getStoreKeyForTable(tableName);
    const table = inMemoryStore[storeKey];
    const pk = Object.values(key)[0];
    const existing = table.get(pk);

    if (!existing) {
      const error = new Error('Item not found for update.');
      error.name = 'ResourceNotFoundException';
      throw error;
    }

    // Condition checks (e.g. availableLitres >= :requiredLitres)
    if (conditionExpression) {
      if (conditionExpression.includes('availableLitres >=')) {
        const reqLitres = expressionAttributeValues[':requiredLitres'];
        if (reqLitres !== undefined && existing.availableLitres < reqLitres) {
          const error = new Error('ConditionalCheckFailedException: Insufficient available litres.');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
      }
      if (conditionExpression.includes('#status IN')) {
        const allowedStatuses = [
          expressionAttributeValues[':available'],
          expressionAttributeValues[':busy'],
        ].filter(Boolean);
        if (allowedStatuses.length > 0 && !allowedStatuses.includes(existing.status)) {
          const error = new Error('ConditionalCheckFailedException: Tanker status is not eligible.');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
      }
    }

    // Apply values from updateExpression and expressionAttributeValues
    const updated = { ...existing };
    const setClause = updateExpression.replace(/^SET\s+/i, '');
    const assignments = setClause.split(',');

    for (const assignment of assignments) {
      const parts = assignment.split('=').map(s => s.trim());
      if (parts.length === 2) {
        const [targetPlaceholder, sourcePlaceholder] = parts;
        const fieldName = expressionAttributeNames[targetPlaceholder] || targetPlaceholder;
        const val = expressionAttributeValues[sourcePlaceholder];
        if (val !== undefined && fieldName) {
          updated[fieldName] = val;
        }
      }
    }

    table.set(pk, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async scan(tableName) {
    const storeKey = getStoreKeyForTable(tableName);
    const table = inMemoryStore[storeKey];
    return Array.from(table.values()).map(v => JSON.parse(JSON.stringify(v)));
  }

  async delete(tableName, key) {
    const storeKey = getStoreKeyForTable(tableName);
    const table = inMemoryStore[storeKey];
    const pk = Object.values(key)[0];
    table.delete(pk);
    return true;
  }

  // Clear or reset in-memory data (useful for tests)
  reset() {
    inMemoryStore.tankers.clear();
    inMemoryStore.requests.clear();
    inMemoryStore.bookings.clear();
    inMemoryStore.reports.clear();
  }

  // Seed initial records into memory
  seed(data = {}) {
    if (data.tankers) {
      data.tankers.forEach(t => inMemoryStore.tankers.set(t.tankerId, { ...t }));
    }
    if (data.requests) {
      data.requests.forEach(r => inMemoryStore.requests.set(r.requestId, { ...r }));
    }
    if (data.bookings) {
      data.bookings.forEach(b => inMemoryStore.bookings.set(b.bookingId, { ...b }));
    }
    if (data.reports) {
      data.reports.forEach(rp => inMemoryStore.reports.set(rp.reportId, { ...rp }));
    }
  }
}

// AWS DynamoDB Document Client Implementation
let awsDocClient = null;

async function getAwsDocClient() {
  if (awsDocClient) return awsDocClient;
  try {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
    awsDocClient = DynamoDBDocumentClient.from(client);
    return awsDocClient;
  } catch (err) {
    // AWS SDK not installed or local environment
    return null;
  }
}

class DynamoDbAdapter {
  constructor() {
    this.inMemory = new InMemoryDbClient();
    this.useAws = Boolean(process.env.AWS_REGION && !process.env.USE_IN_MEMORY_DB && process.env.NODE_ENV === 'production');
  }

  async get(tableName, key) {
    if (!this.useAws) {
      return this.inMemory.get(tableName, key);
    }
    const docClient = await getAwsDocClient();
    if (!docClient) return this.inMemory.get(tableName, key);

    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const res = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
    return res.Item || null;
  }

  async put(tableName, item, conditionExpression = null) {
    if (!this.useAws) {
      return this.inMemory.put(tableName, item, conditionExpression);
    }
    const docClient = await getAwsDocClient();
    if (!docClient) return this.inMemory.put(tableName, item, conditionExpression);

    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    const params = { TableName: tableName, Item: item };
    if (conditionExpression) params.ConditionExpression = conditionExpression;
    await docClient.send(new PutCommand(params));
    return item;
  }

  async update(tableName, key, updateExpression, expressionAttributeNames = {}, expressionAttributeValues = {}, conditionExpression = null) {
    if (!this.useAws) {
      return this.inMemory.update(tableName, key, updateExpression, expressionAttributeNames, expressionAttributeValues, conditionExpression);
    }
    const docClient = await getAwsDocClient();
    if (!docClient) return this.inMemory.update(tableName, key, updateExpression, expressionAttributeNames, expressionAttributeValues, conditionExpression);

    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const params = {
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    };
    if (conditionExpression) params.ConditionExpression = conditionExpression;
    const res = await docClient.send(new UpdateCommand(params));
    return res.Attributes;
  }

  async scan(tableName) {
    if (!this.useAws) {
      return this.inMemory.scan(tableName);
    }
    const docClient = await getAwsDocClient();
    if (!docClient) return this.inMemory.scan(tableName);

    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
    const res = await docClient.send(new ScanCommand({ TableName: tableName }));
    return res.Items || [];
  }

  async delete(tableName, key) {
    if (!this.useAws) {
      return this.inMemory.delete(tableName, key);
    }
    const docClient = await getAwsDocClient();
    if (!docClient) return this.inMemory.delete(tableName, key);

    const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
    await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
    return true;
  }
}

export const db = new DynamoDbAdapter();
