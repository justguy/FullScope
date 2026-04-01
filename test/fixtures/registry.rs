// Filter Registry — manages named filter pipelines.
// Each filter transforms text through a series of steps.

use std::collections::HashMap;
use std::fmt;

/// Errors that can occur during filter operations.
#[derive(Debug)]
pub enum FilterError {
    /// Filter with the given name was not found.
    NotFound(String),
    /// A filter step failed during execution.
    StepFailed { step: usize, message: String },
    /// The input was empty or invalid.
    InvalidInput(String),
}

impl fmt::Display for FilterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FilterError::NotFound(name) => write!(f, "filter not found: {}", name),
            FilterError::StepFailed { step, message } => {
                write!(f, "step {} failed: {}", step, message)
            }
            FilterError::InvalidInput(msg) => write!(f, "invalid input: {}", msg),
        }
    }
}

/// A single step in a filter pipeline.
#[derive(Debug, Clone)]
pub struct FilterStep {
    pub name: String,
    pub pattern: Option<String>,
    pub replacement: Option<String>,
    pub enabled: bool,
}

impl FilterStep {
    /// Create a new filter step.
    pub fn new(name: &str) -> Self {
        FilterStep {
            name: name.to_string(),
            pattern: None,
            replacement: None,
            enabled: true,
        }
    }

    /// Apply this step to the input text.
    pub fn apply(&self, input: &str) -> Result<String, FilterError> {
        if !self.enabled {
            return Ok(input.to_string());
        }

        match self.name.as_str() {
            "strip_comments" => Ok(strip_comments(input)),
            "strip_blanks" => Ok(strip_blank_lines(input)),
            "replace" => {
                if let (Some(pat), Some(rep)) = (&self.pattern, &self.replacement) {
                    Ok(input.replace(pat.as_str(), rep.as_str()))
                } else {
                    Err(FilterError::StepFailed {
                        step: 0,
                        message: "replace step requires pattern and replacement".to_string(),
                    })
                }
            }
            _ => Err(FilterError::StepFailed {
                step: 0,
                message: format!("unknown step: {}", self.name),
            }),
        }
    }
}

/// A complete filter pipeline with ordered steps.
#[derive(Debug, Clone)]
pub struct FilterPipeline {
    pub name: String,
    pub steps: Vec<FilterStep>,
    pub extensions: Vec<String>,
}

impl FilterPipeline {
    /// Create a new empty pipeline.
    pub fn new(name: &str) -> Self {
        FilterPipeline {
            name: name.to_string(),
            steps: Vec::new(),
            extensions: Vec::new(),
        }
    }

    /// Add a step to the pipeline.
    pub fn add_step(&mut self, step: FilterStep) {
        self.steps.push(step);
    }

    /// Apply all steps in order.
    pub fn apply(&self, input: &str) -> Result<String, FilterError> {
        let mut result = input.to_string();
        for (i, step) in self.steps.iter().enumerate() {
            result = step.apply(&result).map_err(|_| FilterError::StepFailed {
                step: i,
                message: format!("step '{}' failed", step.name),
            })?;
        }
        Ok(result)
    }
}

/// Registry of named filter pipelines.
pub struct Registry {
    pipelines: HashMap<String, FilterPipeline>,
    extension_map: HashMap<String, String>,
}

impl Registry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Registry {
            pipelines: HashMap::new(),
            extension_map: HashMap::new(),
        }
    }

    /// Register a pipeline by name and associate file extensions.
    pub fn register(&mut self, pipeline: FilterPipeline) {
        for ext in &pipeline.extensions {
            self.extension_map
                .insert(ext.clone(), pipeline.name.clone());
        }
        self.pipelines.insert(pipeline.name.clone(), pipeline);
    }

    /// Look up a pipeline by file extension.
    pub fn find_by_extension(&self, ext: &str) -> Option<&FilterPipeline> {
        self.extension_map
            .get(ext)
            .and_then(|name| self.pipelines.get(name))
    }

    /// Look up a pipeline by name.
    pub fn find_by_name(&self, name: &str) -> Option<&FilterPipeline> {
        self.pipelines.get(name)
    }

    /// Apply the appropriate pipeline for a file extension.
    pub fn filter(&self, ext: &str, input: &str) -> Result<String, FilterError> {
        let pipeline = self
            .find_by_extension(ext)
            .ok_or_else(|| FilterError::NotFound(ext.to_string()))?;
        pipeline.apply(input)
    }

    /// Return the number of registered pipelines.
    pub fn len(&self) -> usize {
        self.pipelines.len()
    }

    /// Check if the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.pipelines.is_empty()
    }
}

// ─── Helper functions ───

/// Strip single-line comments (// style).
fn strip_comments(input: &str) -> String {
    input
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.starts_with("//") && !trimmed.starts_with("///")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Remove consecutive blank lines, keeping at most one.
fn strip_blank_lines(input: &str) -> String {
    let mut result = Vec::new();
    let mut prev_blank = false;

    for line in input.lines() {
        let is_blank = line.trim().is_empty();
        if is_blank && prev_blank {
            continue;
        }
        result.push(line);
        prev_blank = is_blank;
    }

    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_comments() {
        let input = "// comment\nreal code\n/// doc comment\nmore code";
        let result = strip_comments(input);
        assert!(result.contains("real code"));
        assert!(result.contains("more code"));
        assert!(!result.contains("comment"));
    }

    #[test]
    fn test_pipeline_apply() {
        let mut pipeline = FilterPipeline::new("test");
        pipeline.add_step(FilterStep::new("strip_comments"));
        pipeline.add_step(FilterStep::new("strip_blanks"));

        let input = "// comment\n\n\ncode here\n\n\nmore code";
        let result = pipeline.apply(input).unwrap();
        assert!(result.contains("code here"));
        assert!(result.contains("more code"));
    }

    #[test]
    fn test_registry_lookup() {
        let mut reg = Registry::new();
        let mut pipeline = FilterPipeline::new("rust");
        pipeline.extensions = vec!["rs".to_string()];
        pipeline.add_step(FilterStep::new("strip_comments"));
        reg.register(pipeline);

        assert!(reg.find_by_extension("rs").is_some());
        assert!(reg.find_by_extension("py").is_none());
        assert_eq!(reg.len(), 1);
    }
}
