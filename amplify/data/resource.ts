import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { generateBoqFunction } from '../functions/generate-boq/resource';

/**
 * Define the database schema.
 * Authorization is set to 'owner' so users can only access their own data.
 */
const schema = a.schema({
  Project: a.model({
    name: a.string().required(),
    clientDetails: a.json(), // Stores the ClientDetails object
    rooms: a.hasMany('Room', 'projectId'),
  }).authorization(allow => [allow.owner()]),

  Room: a.model({
    projectId: a.id().required(),
    project: a.belongsTo('Project', 'projectId'),
    name: a.string(),
    answers: a.json(), // Stores the questionnaire answers
    boq: a.json(), // Stores the calculated BOQ array
  }).authorization(allow => [allow.owner()]),

  /**
   * Custom Query to call the backend Lambda function.
   * This hides the API Key and enforces rate limiting.
   */
  generateBoqContent: a.query()
    .arguments({
      prompt: a.string().required(),
      systemInstruction: a.string(),
      responseSchema: a.string(), // JSON string of the schema
    })
    .returns(a.string()) // Returns the JSON string response
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(generateBoqFunction)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});