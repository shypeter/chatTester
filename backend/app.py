from flask import Flask, request, jsonify, make_response
from flask_cors import CORS  
import subprocess
import re
import os

app = Flask(__name__)

# Enable CORS for all routes
CORS(app)

@app.route('/', methods=['GET'])
def main():
    return jsonify({'message': 'The server is running'})

@app.route('/tester/<platform>/<type>', methods=['GET'])
def tester(platform, type):
    try :
        # get the current directory
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        if platform == 'line':
            script_path = os.path.join(current_dir, 'backend', 'line.py')

            if not os.path.exists(script_path):
                return jsonify({
                    'status': 'error',
                    'error': f'Script not found: {script_path}',
                    'platform': platform,
                    'type': type
                }), 404

            # 使用虛擬環境的 Python（根據你的實際路徑修改）
            venv_python = r"C:\Users\petec\Desktop\workspace\AITester\backend\venv\Scripts\python.exe"
            process = subprocess.run(
                [venv_python, script_path, type],
                capture_output=True,
                text=True,
                timeout=600,
                encoding='utf-8',
                cwd=os.path.join(current_dir, 'backend')
            )

        else :
            # get the path of the node script
            script_path = os.path.join(current_dir, 'puppeteer', f'{platform}.js')

            # check if the script exists
            if not os.path.exists(script_path):
                return jsonify({
                    'status': 'error',
                    'error': f'Script not found: {script_path}',
                    'platform': platform,
                    'type': type
                }), 404
        
            # 變更工作目錄到 puppeteer 資料夾 (如果腳本中有相對路徑的引用)
            puppeteer_dir = os.path.join(current_dir, 'puppeteer')

            # exec node script
            process = subprocess.run(
                ['node', script_path, type],
                capture_output=True,
                text=True,
                timeout=600,
                encoding='utf-8',
                cwd=puppeteer_dir
            )

        if process.returncode == 0:
            output = process.stdout
            passed_match = re.search(r'Passed:\s*(\d+)', output)
            failed_match = re.search(r'Failed:\s*(\d+)', output)

            passed = int(passed_match.group(1)) if passed_match else 0
            failed = int(failed_match.group(1)) if failed_match else 0

            return jsonify({
                'status': 'success',
                'passed': passed,
                'failed': failed,
                'platform': platform,
                'type': type
            })
        else:
            return jsonify({
                'status': 'error',
                'error': process.stderr,
                'platform': platform,
                'type': type
            }), 500
    except subprocess.TimeoutExpired:
        return jsonify({
            'status': 'error',
            'error': 'Execution timed out',
            'paltform': platform,
            'type': type
        }), 408
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'paltform': platform,
            'type': type
        }), 500

if __name__ == '__main__':
    app.run(debug=False)
