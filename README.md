# Installation Guide

This project can be installed on both **Windows** and **MacOS** systems.  
Please follow the steps below depending on your operating system.

---

## 🔹 Windows Installation

### Requirements
- [Git](https://git-scm.com/download/win)
- [Python 3.10+](https://www.python.org/downloads/windows/) (make sure to check "Add to PATH" during installation)
- [pip](https://pip.pypa.io/en/stable/installation/)
- [Node.js (LTS)](https://nodejs.org/en/download/prebuilt-installer) (if project requires frontend or build tools)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (for compiling some dependencies)

### Steps
1. **Clone the repository**
   ```powershell
   git clone https://github.com/your-repo/kumayan.git
   cd kumayan
   ```

2. **Create and activate virtual environment**
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. **Install dependencies**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Run the project**
   ```powershell
   python main.py
   ```

---

## 🔹 MacOS Installation

### Requirements
- [Homebrew](https://brew.sh/) (recommended for package management)
- Python 3.10+
- pip (comes with Python)
- Node.js (if required by the project)

### Steps
1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/kumayan.git
   cd kumayan
   ```

2. **Create and activate virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the project**
   ```bash
   python3 main.py
   ```

---

## Notes
- Make sure all required environment variables are set if needed (`.env` file or system environment).
- If you encounter issues with dependencies on Mac, try installing missing build tools:
  ```bash
  xcode-select --install
  ```
- For Windows users, if you face errors related to compilation, ensure **Visual Studio Build Tools** are installed.

---

✅ After following these steps, the project should be ready to run on your system.
