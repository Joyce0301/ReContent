(function registerXiaohongshuFill() {
  const WAIT_FOR_EDITOR_TIMEOUT_MS = 10000;
  const WAIT_FOR_EDITOR_INTERVAL_MS = 250;
  const TITLE_SELECTORS = [
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']"
  ];
  const CONTENT_SELECTORS = [
    "div[contenteditable='true']",
    "textarea[placeholder*='正文']"
  ];
  const LOGIN_MARKERS = [
    "input[placeholder*='手机号']",
    "input[placeholder*='验证码']"
  ];
  const LONG_FORM_ENTRY_TEXT = "写长文";
  const LONG_FORM_CREATE_TEXT = "新的创作";

  function findFirst(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  function dispatchInput(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function dispatchEditorInput(element, value) {
    try {
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: value
        })
      );
    } catch (_error) {
      dispatchInput(element);
    }
  }

  function writeValue(element, value) {
    if ("value" in element) {
      element.focus();
      element.value = value;
      dispatchInput(element);
    }
  }

  function writeRichText(element, value) {
    element.focus();

    if ("value" in element) {
      element.value = value;
      dispatchInput(element);
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let inserted = false;

    try {
      inserted = document.execCommand("insertText", false, value);
    } catch (_error) {
      inserted = false;
    }

    if (!inserted) {
      element.innerHTML = "";

      value.split("\n").forEach((line, index) => {
        if (index > 0) {
          element.appendChild(document.createElement("br"));
        }

        element.appendChild(document.createTextNode(line));
      });
    }

    dispatchEditorInput(element, value);
  }

  function appendTags(content, tags) {
    if (!tags.length) {
      return content;
    }

    return `${content}\n\n${tags.join(" ")}`.trim();
  }

  function normalizeComparableText(value) {
    return value.replace(/\s+/g, "").trim();
  }

  function readElementText(element) {
    if ("value" in element && typeof element.value === "string") {
      return element.value;
    }

    return element.textContent ?? "";
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return style.display !== "none" && style.visibility !== "hidden";
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function findClickableByText(text) {
    return Array.from(
      document.querySelectorAll("button, a, [role='button'], div, span")
    ).find(element => normalizeText(element.textContent ?? "") === text && isVisible(element));
  }

  function advanceIntoLongFormComposer(progress) {
    if (!progress.enteredLongForm) {
      const longFormEntry = findClickableByText(LONG_FORM_ENTRY_TEXT);

      if (longFormEntry) {
        longFormEntry.click();
        progress.enteredLongForm = true;
        return true;
      }
    }

    if (!progress.startedLongFormDraft) {
      const createEntry = findClickableByText(LONG_FORM_CREATE_TEXT);

      if (createEntry) {
        createEntry.click();
        progress.startedLongFormDraft = true;
        return true;
      }
    }

    return false;
  }

  async function verifyFilledContent(titleElement, contentElement, payload) {
    const expectedContent = normalizeComparableText(
      appendTags(payload.content, payload.tags)
    );

    await new Promise(resolve => window.setTimeout(resolve, 80));

    const actualTitle = normalizeComparableText(readElementText(titleElement));
    const actualContent = normalizeComparableText(readElementText(contentElement));

    return (
      actualTitle === normalizeComparableText(payload.title) &&
      actualContent.includes(expectedContent)
    );
  }

  async function waitForEditorState() {
    const startTime = Date.now();
    let loginSeenAt = null;
    const progress = {
      enteredLongForm: false,
      startedLongFormDraft: false
    };

    while (Date.now() - startTime < WAIT_FOR_EDITOR_TIMEOUT_MS) {
      const titleElement = findFirst(TITLE_SELECTORS);
      const contentElement = findFirst(CONTENT_SELECTORS);

      if (titleElement && contentElement) {
        return {
          kind: "editor",
          titleElement,
          contentElement
        };
      }

      const loginInputs = LOGIN_MARKERS
        .map(selector => document.querySelector(selector))
        .filter(Boolean)
        .filter(isVisible);

      if (loginInputs.length >= 2) {
        if (loginSeenAt == null) {
          loginSeenAt = Date.now();
        }

        if (Date.now() - loginSeenAt >= 600) {
          return {
            kind: "login"
          };
        }
      } else {
        loginSeenAt = null;
      }

      if (advanceIntoLongFormComposer(progress)) {
        await new Promise(resolve =>
          window.setTimeout(resolve, WAIT_FOR_EDITOR_INTERVAL_MS)
        );
        continue;
      }

      await new Promise(resolve =>
        window.setTimeout(resolve, WAIT_FOR_EDITOR_INTERVAL_MS)
      );
    }

    return {
      kind: "unsupported"
    };
  }

  window.__RECONTENT_XHS_FILL__ = async payload => {
    const editorState = await waitForEditorState();

    if (editorState.kind === "login") {
      return {
        status: "login_required",
        message: "请先登录小红书，登录完成后重新发送。"
      };
    }

    if (editorState.kind === "unsupported") {
      return {
        status: "unsupported_page",
        message: "小红书页面结构已变化，当前无法自动填充。"
      };
    }

    const { titleElement, contentElement } = editorState;
    writeValue(titleElement, payload.title);
    writeRichText(contentElement, appendTags(payload.content, payload.tags));

    if (!(await verifyFilledContent(titleElement, contentElement, payload))) {
      return {
        status: "failed",
        message: "小红书编辑页未成功接收内容，请检查页面后重试。"
      };
    }

    return {
      status: "filled",
      message: "已打开小红书编辑页，请检查内容后保存草稿。"
    };
  };
})();
