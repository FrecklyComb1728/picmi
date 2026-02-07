const expressOk = (res, data = null, message = 'ok') => {
  res.json({ code: 0, message, data })
}

const expressFail = (res, status, code, message) => {
  res.status(status).json({ code, message, data: null })
}

export { expressOk, expressFail }
