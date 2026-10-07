import { calendarImportPreview } from './calendar-import.mjs';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: calendarImportPreview(data.text, data.options) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
