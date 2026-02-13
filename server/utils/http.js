const expressOk = (res, data = null, message = 'ok') => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.json({ code: 0, message, data })
}

const expressFail = (res, status, code, message) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.status(status).json({ code, message, data: null })
}

export { expressOk, expressFail }
