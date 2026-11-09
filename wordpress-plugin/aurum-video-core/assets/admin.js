(function () {
	'use strict';
	var exportType = document.getElementById('aurum-export-type');
	var categoryField = document.getElementById('aurum-category-field');
	if (exportType && categoryField) {
		var syncCategory = function () { categoryField.hidden = exportType.value !== 'category'; };
		exportType.addEventListener('change', syncCategory); syncCategory();
	}
	var fileInput = document.getElementById('aurum-csv-file');
	var drop = fileInput && fileInput.closest('.aurum-csv-drop');
	var fileName = document.getElementById('aurum-csv-file-name');
	if (fileInput && drop && fileName) {
		var showFile = function () { fileName.textContent = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : 'เลือกไฟล์ CSV'; };
		fileInput.addEventListener('change', showFile);
		['dragenter', 'dragover'].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add('is-dragging'); }); });
		['dragleave', 'drop'].forEach(function (name) { drop.addEventListener(name, function () { drop.classList.remove('is-dragging'); }); });
	}
	var form = document.getElementById('aurum-csv-apply');
	if (!form) return;
	form.addEventListener('submit', async function (event) {
		event.preventDefault();
		var button = form.querySelector('[type=submit]');
		var status = document.getElementById('aurum-csv-progress');
		button.disabled = true;
		try {
			var finished = false;
			while (!finished) {
				var data = new FormData(form); data.set('ajax', '1');
				// A hidden input named action shadows HTMLFormElement.action.
				var response = await fetch(form.getAttribute('action'), { method: 'POST', body: data, credentials: 'same-origin' });
				if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('ไม่ได้รับผลการบันทึก กรุณาตรวจผลและเข้าสู่ระบบใหม่ก่อนลองอีกครั้ง');
				var result = await response.json();
				if (!response.ok || !result.success) throw new Error(result.data && result.data.message || 'บันทึกไม่สำเร็จ กรุณาตรวจผลก่อนลองใหม่');
				finished = result.data.finished;
				var counts = result.data.counts;
				status.textContent = result.data.processed + ' / ' + result.data.total + ' รายการ · บันทึก ' + counts.updated + ' · ข้าม ' + counts.skipped + ' · ไม่ผ่าน ' + (counts.invalid + counts.error);
			}
			button.textContent = 'ดำเนินการครบแล้ว'; button.value = 'ดำเนินการครบแล้ว';
			window.location.reload();
		} catch (error) {
			status.textContent = error.message; button.disabled = false;
		}
	});
}());
