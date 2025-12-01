import { defineFunction, secret } from '@aws-amplify/backend';

export const generateBoqFunction = defineFunction({
  name: 'generate-boq',
  entry: './handler.ts',
  // Securely inject the API Key from AWS Secrets Manager
  environment: {
    GEMINI_API_KEY: secret('GEMINI_API_KEY'), 
  },
  timeoutSeconds: 60, // Allow time for GenAI to think
});