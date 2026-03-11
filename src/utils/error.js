const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && value.constructor === Object;

export const toErrorMessage = (error, fallback = '操作失败，请重试') => {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string') {
    const message = error.trim();
    return message || fallback;
  }

  if (error instanceof Error) {
    const message = String(error.message || '').trim();
    return message || fallback;
  }

  if (isPlainObject(error)) {
    const directMessage = String(error.message || '').trim();
    if (directMessage) {
      return directMessage;
    }

    const nestedMessage = String(error.error?.message || '').trim();
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') {
      return serialized;
    }
  } catch {
    // ignore serialization errors and fallback to String coercion
  }

  const casted = String(error).trim();
  return casted && casted !== '[object Object]' ? casted : fallback;
};
