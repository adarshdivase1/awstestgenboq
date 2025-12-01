import { defineAuth } from '@aws-amplify/backend';

/**
 * Define authentication using Cognito.
 * This creates a User Pool and Identity Pool.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});