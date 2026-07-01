import { closestFromEvent } from "./app-dom.js";

export function renderInputGrid(container, prefix, values, maxCards) {
  if (container.childElementCount !== maxCards) {
    const controls = Array.from({ length: maxCards }, (_, index) => {
      const combobox = document.createElement("div");
      combobox.className = "card-combobox";
      combobox.dataset.comboMode = "live";

      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = maxCards === 1 ? "카드명 입력/선택" : `카드 ${index + 1}`;
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.dataset.index = String(index);
      input.id = `${prefix}${index + 1}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "combo-toggle";
      toggle.tabIndex = -1;
      toggle.setAttribute("aria-label", "카드 목록 열기");
      toggle.textContent = "▾";

      const menu = document.createElement("div");
      menu.className = "combo-menu";
      menu.setAttribute("role", "listbox");

      combobox.append(input, toggle, menu);
      return combobox;
    });
    container.replaceChildren(...controls);
  }

  [...container.querySelectorAll("input")].forEach((input, index) => {
    input.value = values[index] || "";
  });
}

export function readInputs(container) {
  return [...container.querySelectorAll("input")].map((input) => input.value);
}

function getCombobox(input) {
  return input ? input.closest(".card-combobox") : null;
}

function getComboInputFromEvent(event) {
  return closestFromEvent(event, "input");
}

function getComboMenu(input) {
  return getCombobox(input)?.querySelector(".combo-menu") || null;
}

function getComboOptions(input) {
  return [...(getComboMenu(input)?.querySelectorAll(".combo-option") || [])];
}

function resetComboScroll(input) {
  const menu = getComboMenu(input);
  if (menu) menu.scrollTop = 0;
}

function setComboActive(input, nextIndex) {
  const combobox = getCombobox(input);
  const options = getComboOptions(input);
  if (!combobox || !options.length) return;

  const maxIndex = options.length - 1;
  const index = Math.max(0, Math.min(nextIndex, maxIndex));
  combobox.dataset.activeIndex = String(index);
  options.forEach((option, optionIndex) => {
    option.setAttribute("aria-selected", String(optionIndex === index));
  });
  options[index].scrollIntoView({ block: "nearest" });
}

export function closeCombobox(input) {
  const combobox = getCombobox(input);
  if (!combobox) return;
  combobox.classList.remove("open");
  combobox.dataset.activeIndex = "-1";
  const menu = combobox.querySelector(".combo-menu");
  if (menu) {
    menu.scrollTop = 0;
    menu.replaceChildren();
  }
  const textInput = combobox.querySelector("input");
  if (textInput) textInput.setAttribute("aria-expanded", "false");
}

export function closeOpenComboboxes() {
  document.querySelectorAll(".card-combobox.open input").forEach(closeCombobox);
}

function closeOtherComboboxes(currentInput) {
  document.querySelectorAll(".card-combobox.open").forEach((combobox) => {
    if (combobox !== getCombobox(currentInput)) {
      closeCombobox(combobox.querySelector("input"));
    }
  });
}

export function createComboboxController({
  addObservation,
  addLiveCard,
  findCard,
  getCardSuggestions,
}) {
  let suppressNextComboClick = false;

  function renderCombobox(input) {
    const combobox = getCombobox(input);
    const menu = getComboMenu(input);
    if (!combobox || !menu) return;

    closeOtherComboboxes(input);
    const cards = getCardSuggestions(input.value);
    const options = cards.map((card, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "combo-option";
      option.dataset.cardName = card.name;
      option.dataset.index = String(index);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");

      const name = document.createElement("strong");
      name.textContent = card.name;
      const meta = document.createElement("small");
      meta.textContent = [card.race, card.tier ? `${card.tier}티어` : "", card.source]
        .filter(Boolean)
        .join(" · ");
      option.append(name, meta);
      return option;
    });

    menu.replaceChildren(...options);
    resetComboScroll(input);
    combobox.classList.toggle("open", options.length > 0);
    combobox.dataset.activeIndex = "-1";
    input.setAttribute("aria-expanded", String(options.length > 0));
  }

  function focusComboInput(input, options = {}) {
    const combobox = getCombobox(input);
    if (options.suppressMenu && combobox) {
      combobox.dataset.suppressNextFocus = "true";
      window.setTimeout(() => {
        if (combobox.dataset.suppressNextFocus === "true") {
          delete combobox.dataset.suppressNextFocus;
        }
      }, 0);
    }

    input.focus();

    if (options.suppressMenu) {
      window.requestAnimationFrame(() => closeCombobox(input));
    }
  }

  function chooseComboCard(input, cardName) {
    const combobox = getCombobox(input);
    const mode = combobox?.dataset.comboMode;
    const result = combobox?.dataset.result;
    input.value = cardName;
    closeCombobox(input);

    if (mode === "observation") {
      addObservation(result, cardName);
      input.value = "";
      focusComboInput(input, { suppressMenu: true });
      return;
    }

    addLiveCard(cardName);
    input.value = "";
    focusComboInput(input, { suppressMenu: true });
  }

  function handleInput(event) {
    const input = getComboInputFromEvent(event);
    if (!input || !getCombobox(input)) return;

    const combobox = getCombobox(input);
    const mode = combobox.dataset.comboMode;
    const exactCard = findCard(input.value);

    if (mode === "observation" && exactCard && !event.isComposing) {
      chooseComboCard(input, exactCard.name);
      return;
    }

    if (mode === "live" && exactCard && !event.isComposing) {
      chooseComboCard(input, exactCard.name);
      return;
    }

    renderCombobox(input);
  }

  function handleFocus(event) {
    const input = getComboInputFromEvent(event);
    const combobox = getCombobox(input);
    if (!input || !combobox) return;
    if (combobox.dataset.suppressNextFocus === "true") {
      delete combobox.dataset.suppressNextFocus;
      return;
    }
    renderCombobox(input);
  }

  function handleKeydown(event) {
    const input = getComboInputFromEvent(event);
    if (!input || !getCombobox(input)) return;

    const combobox = getCombobox(input);
    const open = combobox.classList.contains("open");
    const options = getComboOptions(input);
    const currentIndex = Number(combobox.dataset.activeIndex || -1);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) renderCombobox(input);
      setComboActive(input, currentIndex < 0 ? 0 : currentIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) renderCombobox(input);
      setComboActive(input, currentIndex < 0 ? options.length - 1 : currentIndex - 1);
      return;
    }

    if (event.key === "Enter") {
      const activeOption = options[currentIndex];
      const exactCard = findCard(input.value);
      if (activeOption || exactCard) {
        event.preventDefault();
        chooseComboCard(input, activeOption?.dataset.cardName || exactCard.name);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeCombobox(input);
      if (combobox.dataset.comboMode === "observation") input.value = "";
    }
  }

  function handleCompositionEnd(event) {
    const input = getComboInputFromEvent(event);
    if (!input || !getCombobox(input)) return;

    window.requestAnimationFrame(() => {
      handleInput({ target: input, isComposing: false });
    });
  }

  function handlePointerDown(event) {
    const option = closestFromEvent(event, ".combo-option");
    if (!option) return;

    event.preventDefault();
    suppressNextComboClick = true;
    window.setTimeout(() => {
      suppressNextComboClick = false;
    }, 250);
    const input = option.closest(".card-combobox")?.querySelector("input");
    if (input) chooseComboCard(input, option.dataset.cardName);
  }

  function handleClick(event) {
    if (suppressNextComboClick) {
      suppressNextComboClick = false;
      event.preventDefault();
      closeOpenComboboxes();
      return true;
    }

    const option = closestFromEvent(event, ".combo-option");
    if (option) {
      const input = option.closest(".card-combobox")?.querySelector("input");
      if (input) chooseComboCard(input, option.dataset.cardName);
      return true;
    }

    const clickedInput = getComboInputFromEvent(event);
    if (clickedInput && getCombobox(clickedInput)) {
      renderCombobox(clickedInput);
      return true;
    }

    const toggle = closestFromEvent(event, ".combo-toggle");
    if (toggle) {
      const input = toggle.closest(".card-combobox")?.querySelector("input");
      if (!input) return false;
      if (getCombobox(input).classList.contains("open")) {
        closeCombobox(input);
      } else {
        input.focus();
        renderCombobox(input);
      }
      return true;
    }

    return false;
  }

  function handlePointerMove(event) {
    const option = closestFromEvent(event, ".combo-option");
    if (!option) return;
    const input = option.closest(".card-combobox")?.querySelector("input");
    if (input) setComboActive(input, Number(option.dataset.index));
  }

  return {
    handleClick,
    handleCompositionEnd,
    handleFocus,
    handleInput,
    handleKeydown,
    handlePointerDown,
    handlePointerMove,
  };
}
