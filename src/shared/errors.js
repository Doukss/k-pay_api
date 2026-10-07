export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorHandler(error, _req, res, _next) {
  let status = error.status || 500;
  let message = error.message;
  if (error.code === 'P2002') {
    status = 409;
    const fields = error.meta?.target || [];
    message = fields.includes('email') ? 'Cette adresse email est déjà utilisée' :
      fields.includes('phoneNormalized') ? 'Ce numéro de téléphone est déjà enregistré' :
        fields.includes('tenantId') && fields.includes('billingPeriod') ? 'Le loyer de ce locataire est déjà enregistré pour ce mois' :
          'Une valeur existe déjà pour ce compte';
  }
  if (error.code === 'P2025') { status = 404; message = 'Ressource introuvable'; }
  if (error.code === 'P2003') { status = 400; message = 'Cette opération est incompatible avec les données liées'; }
  if (status >= 500) console.error(error);
  res.status(status).json({ message: status === 500 ? 'Erreur interne du serveur' : message, ...(error.details ? { details: error.details } : {}) });
}
