// Autocomplete text input: live suggestions, keyboard nav, submit.
import { suggest } from "./match.js";

export class Autocomplete {
  constructor(inputEl, listEl, { onSubmit }) {
    this.input = inputEl;
    this.list = listEl;
    this.onSubmit = onSubmit;
    this.kind = "country";
    this.items = [];
    this.active = -1;
    this.exclude = new Set(); // normalized answers already tried this question

    this.input.addEventListener("input", () => this._refresh());
    this.input.addEventListener("keydown", (e) => this._key(e));
    this.list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      this._choose(Number(li.dataset.i));
    });
    document.addEventListener("click", (e) => {
      if (!this.list.contains(e.target) && e.target !== this.input) this._hide();
    });
  }

  setKind(kind) {
    this.kind = kind;
  }
  setExclude(set) {
    this.exclude = set || new Set();
  }
  clear() {
    this.input.value = "";
    this._hide();
  }
  refocus() {
    this.input.value = "";
    this._hide();
    this.input.focus();
  }

  enable(placeholder) {
    this.input.disabled = false;
    this.input.placeholder = placeholder || "Type your answer…";
    this.input.value = "";
    this._hide();
  }
  disable() {
    this.input.disabled = true;
    this.input.value = "";
    this._hide();
  }
  focus() {
    this.input.focus();
  }

  _refresh() {
    const q = this.input.value;
    // show all matches (the list scrolls); never reveal which country a capital
    // belongs to — that would give the answer away.
    this.items = suggest(q, this.kind, 200, this.exclude);
    if (!this.items.length) {
      this.active = -1;
      return this._hide();
    }
    this.list.innerHTML = this.items
      .map((it, i) => {
        const sub =
          this.kind === "capital" ? "" : `<span class="ac-sub">${it.country.region || ""}</span>`;
        return `<li data-i="${i}" role="option"><span class="ac-name">${it.display}</span>${sub}</li>`;
      })
      .join("");
    this.list.hidden = false;
    // when the list has narrowed to a few options, pre-select the top one so a
    // single Enter accepts it (no need to arrow down first)
    this.active = this.items.length <= 3 ? 0 : -1;
    this._highlight();
  }

  _hide() {
    this.list.hidden = true;
    this.list.innerHTML = "";
    this.active = -1;
  }

  _highlight() {
    [...this.list.children].forEach((li, i) =>
      li.classList.toggle("active", i === this.active)
    );
  }

  _key(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!this.items.length) return;
      this.active = (this.active + 1) % this.items.length;
      this._highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!this.items.length) return;
      this.active = (this.active - 1 + this.items.length) % this.items.length;
      this._highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.active >= 0) this._choose(this.active);
      else this._submitRaw();
    } else if (e.key === "Escape") {
      this._hide();
    }
  }

  _choose(i) {
    const it = this.items[i];
    if (!it) return;
    const v = it.display;
    this._hide();
    this.input.value = ""; // clear the writing after submitting
    this.onSubmit(v);
  }

  _submitRaw() {
    const v = this.input.value.trim();
    if (!v) return;
    this._hide();
    this.input.value = "";
    this.onSubmit(v);
  }
}
