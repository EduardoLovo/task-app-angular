// Build de produção: APIs publicadas no Render (plano free). Elas dormem depois de 15 min sem acesso e o banco
// começa vazio a cada reinício, por isso `demo: true` liga os avisos de demonstração na interface.
export const environment = {
  demo: true,
  apis: {
    express: 'https://task-api-express-2pva.onrender.com',
    flask: 'https://task-api-flask-1ozq.onrender.com',
  },
};
