import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 3000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-before-deploy',
  databaseUrl: process.env.DATABASE_URL,
  businessTimeZone: process.env.BUSINESS_TIME_ZONE || 'Africa/Dakar',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  whatsappTemplateName: process.env.WHATSAPP_TEMPLATE_NAME,
  whatsappTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'fr',
  whatsappGraphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0',
  nodeEnv: process.env.NODE_ENV || 'development',
};
