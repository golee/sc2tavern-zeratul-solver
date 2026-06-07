export function makeCell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

export function makeTag(text, type) {
  const span = document.createElement("span");
  span.className = `tag ${type}`;
  span.textContent = text;
  return span;
}

export function setConditionText(element, text) {
  element.textContent = text;
  element.title = text === "-" ? "" : text;
}

export function setEmptyRow(tbody, colSpan, message) {
  tbody.replaceChildren();
  const tr = document.createElement("tr");
  tr.className = "empty-row";
  const td = document.createElement("td");
  td.colSpan = colSpan;
  td.textContent = message;
  tr.append(td);
  tbody.append(tr);
}

export function closestFromEvent(event, selector) {
  return event.target instanceof Element ? event.target.closest(selector) : null;
}

export function createToast(toastElement) {
  function showToast(message) {
    window.clearTimeout(showToast.timer);
    toastElement.textContent = message;
    toastElement.classList.add("show");
    showToast.timer = window.setTimeout(() => {
      toastElement.classList.remove("show");
    }, 2200);
  }

  return showToast;
}
