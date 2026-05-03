use std::sync::Mutex;
use std::io::Write;

pub struct FileWriter<'a> {
    pub file: &'a Mutex<Option<Mutex<std::fs::File>>>,
}

impl<'a> Write for FileWriter<'a> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let guard = self.file.lock().map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to lock log file mutex: {}", e),
            )
        })?;

        if let Some(ref mutex_file) = *guard {
            if let Ok(mut file) = mutex_file.lock() {
                return file.write(buf);
            }
        }

        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let guard = self.file.lock().map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to lock log file mutex: {}", e),
            )
        })?;

        if let Some(ref mutex_file) = *guard {
            if let Ok(mut file) = mutex_file.lock() {
                return file.flush();
            }
        }

        Ok(())
    }
}
