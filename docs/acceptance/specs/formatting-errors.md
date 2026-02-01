# Feature: Formatter errors are visible

## Scenario: formatting invalid code shows issues
Given the app is ready
And a new project config exists
When I create a code section named "Formatter Code"
And I focus the code area for "Formatter Code"
And I set the code to:
  """
  def bad(:
    pass
  """
And I press "Alt+Shift+F"
Then I should see "Failed to run formatter."
And I open the Issues panel for "Formatter Code"
And I should see "Problems"
